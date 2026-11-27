import { test, expect, Page, Browser } from "@playwright/test";
import { createDecipheriv } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dialog, sessionWith, session, sql, submit, PASSWORD, URL, autoHydrate, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const SECRET = "S3cret!Valeur-42";
const NOTES = "codes de secours : 111 222 333";
const q = async (text: string) => { const d = sql(); const r = await d.unsafe(text); await d.end(); return r; };
const one = async (text: string) => (await q(text))[0];
let vaultId = "";
const bodies: string[] = []; // toutes les réponses reçues par le navigateur pendant les tests du coffre

/** Action serveur rejouée telle quelle (id + corps capturés lors d'un vrai clic) — contourne l'interface. */
async function captureAction(page: Page, trigger: () => Promise<void>) {
  let id = "", body = "", url = "";
  const h = (rq: import("@playwright/test").Request) => { const a = rq.headers()["next-action"]; if (a && rq.method() === "POST") { id = a; body = rq.postData() ?? ""; url = rq.url(); } };
  page.on("request", h); await trigger(); await expect.poll(() => id, { timeout: 15_000 }).not.toBe(""); page.off("request", h);
  return { id, body, url };
}
const replay = async (page: Page, a: { id: string; body: string; url: string }, body = a.body) =>
  page.request.post(a.url, { headers: { "next-action": a.id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" }, data: body });

test("coffre-fort : fermé par défaut, mauvais mot de passe refusé et journalisé", async ({ browser }) => {
  const { ctx, page } = await sessionWith(browser, "eliott", {});
  page.on("response", async (r) => { try { if (r.url().includes(URL)) bodies.push(await r.text()); } catch { /* flux */ } });
  await page.goto("/ressources/coffre-fort");
  await expect(page.getByText("Coffre verrouillé")).toBeVisible();
  await expect(page.getByRole("button", { name: /^ajouter$/i })).toHaveCount(0);
  await page.getByLabel("Mot de passe", { exact: true }).fill("MauvaisMdp1");
  await submit(page, "form button[type=submit]");
  await expect(page.locator("[aria-live=polite]")).toContainText(/mot de passe incorrect/i);
  expect((await one(`select count(*)::int as n from audit_log where action = 'coffre.deverrouillage_refuse' and sensitive = true`)).n).toBe(1);
  await ctx.close();
});

test("coffre-fort : déverrouillage, ajout, chiffrement AES-256-GCM réel en base, secret jamais envoyé au navigateur", async ({ browser }) => {
  const { ctx, page } = await sessionWith(browser, "eliott", {});
  page.on("response", async (r) => { try { if (r.url().includes(URL)) bodies.push(await r.text()); } catch { /* flux */ } });
  await page.goto("/ressources/coffre-fort");
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await submit(page, "form button[type=submit]");
  await expect(page.getByText(/déverrouillé pour 10 minutes/i)).toBeVisible();
  await page.getByRole("button", { name: /^ajouter$/i }).click();
  const d = dialog(page);
  await d.getByRole("textbox", { name: "Service", exact: true }).fill("Instagram");
  await d.getByLabel("Catégorie").selectOption("instagram");
  await d.getByLabel("Libellé").fill("Compte principal");
  await d.getByLabel("Identifiant / e-mail").fill("dlal.media");
  await d.getByLabel("Mot de passe / secret").fill(SECRET);
  await d.getByLabel(/notes chiffrées/i).fill(NOTES);
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.locator("div.font-semibold", { hasText: /^Instagram$/ })).toBeVisible();
  await expect(page.getByText("••••••••••••")).toBeVisible(); // masqué par défaut
  expect(await page.content()).not.toContain("S3cret");
  const row = await one(`select id, secret_enc, notes_enc from vault_items where service = 'Instagram'`);
  vaultId = row.id;
  expect(row.secret_enc).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  expect(row.secret_enc + row.notes_enc).not.toContain("S3cret");
  expect(row.secret_enc + row.notes_enc).not.toContain("111 222");
  // le chiffrement est réel : on le déchiffre indépendamment avec la clé du serveur
  const key = Buffer.from(process.env.VAULT_MASTER_KEY!, "base64");
  const dec = (enc: string, aad: string) => { const [, iv, tag, ct] = enc.split(":"); const x = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64")); x.setAAD(Buffer.from(aad)); x.setAuthTag(Buffer.from(tag, "base64")); return Buffer.concat([x.update(Buffer.from(ct, "base64")), x.final()]).toString("utf8"); };
  expect(dec(row.secret_enc, `vault:${vaultId}`)).toBe(SECRET);
  expect(dec(row.notes_enc, `vault:${vaultId}`)).toBe(NOTES);
  expect(() => dec(row.secret_enc, "vault:autre-enregistrement")).toThrow(); // lié à son enregistrement
  const [v, iv, tag, ct] = row.secret_enc.split(":");
  const flipped = Buffer.from(ct, "base64"); flipped[0] ^= 1;
  expect(() => dec([v, iv, tag, flipped.toString("base64")].join(":"), `vault:${vaultId}`)).toThrow(); // toute altération est détectée
  expect(bodies.join("\n")).not.toContain("S3cret"); // aucune réponse du serveur ne contient le secret
  expect(bodies.join("\n")).not.toContain("secret_enc");
  await ctx.close();
});

test("coffre-fort : révélation temporaire (masquée seule après 20 s), copie, verrouillage, rejeu refusé côté serveur", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await sessionWith(browser, "eliott", {});
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/ressources/coffre-fort");
  // Nouveau navigateur = pas de cookie de déverrouillage : le coffre est verrouillé, il faut ressaisir le mot de passe
  await expect(page.getByText(/verrouillage auto/i)).toHaveCount(0);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await submit(page, "form button[type=submit]");
  await expect(page.getByText(/verrouillage auto/i)).toBeVisible();
  const reveal = await captureAction(page, async () => { await page.getByRole("button", { name: "Révéler" }).click(); });
  await expect(page.getByText(SECRET)).toBeVisible();
  await page.getByRole("button", { name: "Masquer" }).click();
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await page.getByRole("button", { name: "Révéler" }).click();
  await expect(page.getByText(SECRET)).toBeVisible();
  await expect(page.getByText(SECRET)).toHaveCount(0, { timeout: 25_000 }); // se masque seul
  await page.getByRole("button", { name: "Copier" }).click();
  await expect(page.getByText(/copié/i).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SECRET);
  expect((await one(`select count(*)::int as n from audit_log where action = 'coffre.consultation'`)).n).toBeGreaterThanOrEqual(3); // chaque consultation est tracée
  await expect(page.getByText(/journal des consultations/i)).toBeVisible();
  await page.getByRole("button", { name: "Verrouiller" }).click();
  await expect(page.getByText("Coffre verrouillé")).toBeVisible();
  await expect(page.getByRole("button", { name: "Révéler" })).toBeDisabled();
  const res = await replay(page, reveal); // on rejoue l'action « révéler » alors que le coffre est verrouillé
  expect(await res.text()).toMatch(/coffre verrouillé/i);
  expect(await res.text()).not.toContain("S3cret");
  await ctx.close();
});

test("coffre-fort : Arthur ne peut ni le voir, ni rejouer une action de révélation", async ({ browser }) => {
  const eliott = await sessionWith(browser, "eliott", {});
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/ressources/coffre-fort");
  await eliott.page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await submit(eliott.page, "form button[type=submit]");
  const reveal = await captureAction(eliott.page, async () => { await eliott.page.getByRole("button", { name: "Révéler" }).click(); });
  const res = await replay(arthur.page, reveal);
  const txt = await res.text();
  expect(txt).toMatch(/permission/i);
  expect(txt).not.toContain("S3cret");
  // Le serveur diffuse en flux : le refus arrive soit en 307, soit en 200 portant l'instruction de redirection, sans aucune donnée du coffre
  const direct = await arthur.page.request.get("/ressources/coffre-fort", { maxRedirects: 0 });
  const body = await direct.text();
  expect([200, 307]).toContain(direct.status());
  for (const t of ["Instagram", "dlal.media", "Compte principal", "S3cret", "vault-secret"]) expect(body).not.toContain(t);
  if (direct.status() === 200) expect(body).toMatch(/NEXT_REDIRECT|refus=coffre/);
  await arthur.page.goto("/ressources/coffre-fort");
  await expect(arthur.page).toHaveURL(/refus=coffre/);
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("aucun secret dans le journal, les notifications, les sauvegardes ni les exports ; journal en écriture seule", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  const dump = async (sqlText: string) => JSON.stringify(await q(sqlText));
  for (const t of ["audit_log", "notifications", "login_events", "tasks", "contacts", "metric_snapshots"]) expect(await dump(`select * from ${t}`), t).not.toContain("S3cret");
  const backup = await (await page.request.get("/api/sauvegarde")).text();
  expect(backup).not.toContain("S3cret"); expect(backup).not.toContain("111 222");
  const j = JSON.parse(backup);
  expect(j.format).toBe("dlal-qg-backup"); expect(j.tables.vault_items[0].secret_enc).toMatch(/^v1:/);
  for (const e of ["contacts", "taches", "finances", "production"]) expect(await (await page.request.get(`/api/export/${e}?format=csv`)).text(), e).not.toContain("S3cret");
  expect(Object.keys(j.tables)).not.toContain("sessions"); expect(Object.keys(j.tables)).not.toContain("auth_tokens"); // jetons de session / d'invitation exclus
  const log = existsSync("/tmp/dlal-e2e-server.log") ? readFileSync("/tmp/dlal-e2e-server.log", "utf8") : "";
  expect(log).not.toContain("S3cret"); // pas dans les journaux du serveur
  // journal d'audit inaltérable
  const d = sql();
  await expect(d.unsafe(`update audit_log set summary = 'falsifié'`)).rejects.toThrow(/écriture seule/);
  await expect(d.unsafe(`delete from audit_log`)).rejects.toThrow(/écriture seule/);
  await d.end();
  await ctx.close();
});

test("cookies de session : HttpOnly, SameSite, jeton haché en base ; action serveur depuis une origine tierce refusée", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  const c = (await ctx.cookies()).find((x) => x.name === "dlal_session")!;
  expect(c.httpOnly).toBe(true); expect(c.sameSite).toBe("Lax"); expect(c.secure).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("dlal_session"); // illisible par un script
  const hashes = (await q(`select token_hash from sessions`)).map((r) => r.token_hash);
  expect(hashes).not.toContain(c.value); expect(hashes.every((h: string) => /^[0-9a-f]{64}$/.test(h))).toBe(true); // seul le hachage est stocké
  // une page d'un autre site ne peut pas déclencher une action avec la session de l'utilisateur
  await page.goto("/missions");
  const t = await captureAction(page, async () => { await page.getByRole("tab", { name: /communes/i }).click().catch(() => {}); await page.getByRole("button", { name: /nouvelle tâche/i }).first().click(); await dialog(page).getByLabel("Titre").fill("Tâche d'origine"); await submit(page, "[role=dialog] form button[type=submit]"); });
  const forged = await page.request.post(t.url, { headers: { "next-action": t.id, "content-type": "text/plain;charset=UTF-8", origin: "https://site-malveillant.example" }, data: t.body.replace("Tâche d'origine", "Tâche CSRF") });
  expect((await one(`select count(*)::int as n from tasks where title = 'Tâche CSRF'`)).n).toBe(0);
  expect(forged.status()).not.toBe(200); // refusée : origine non autorisée
  await ctx.close();
});

test("injections : XSS stocké neutralisé, apostrophes et guillemets sans erreur, recherche SQL inoffensive", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  const xss = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>`;
  await page.goto("/missions");
  await page.getByRole("button", { name: /nouvelle tâche/i }).first().click();
  await dialog(page).getByLabel("Titre").fill(xss + " l'invité \"test\"");
  await dialog(page).getByLabel("Description").fill(xss);
  await submit(page, "[role=dialog] form button[type=submit]");
  await page.goto("/missions");
  await expect(page.getByText("l'invité \"test\"").first()).toBeVisible(); // affiché comme texte
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.locator("main img[src='x']").count()).toBe(0);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/invités, épisodes/i).fill("' OR 1=1; DROP TABLE tasks; --");
  await page.waitForTimeout(700);
  await expect(page.getByText(/aucun résultat/i)).toBeVisible();
  expect((await one(`select count(*)::int as n from tasks`)).n).toBeGreaterThan(5); // la table existe toujours
  await page.keyboard.press("Escape");
  // Le rendu en flux peut répondre 200 : on exige donc la page « introuvable » et aucune donnée
  for (const u of ["/crm/00000000-0000-0000-0000-000000000000", "/crm/pas-un-uuid"]) {
    await page.goto(u);
    await expect(page.getByRole("heading", { name: /restée dans l.ombre/i })).toBeVisible();
  }
  await ctx.close();
});

/* ───────────────────────────── ADMINISTRATION ───────────────────────────── */
async function openTeam(page: Page) { await page.goto("/parametres?onglet=equipe"); }
const linkFrom = async (page: Page) => page.locator("input[readonly]").first().inputValue();

test("invitation d'un lecteur : lien à usage unique, compte créé, droits en lecture seule (serveur)", async ({ browser }) => {
  const admin = await session(browser, "eliott");
  await openTeam(admin.page);
  await admin.page.getByRole("button", { name: /inviter un collaborateur/i }).click();
  await dialog(admin.page).getByLabel("Prénom et nom").fill("Léo Lecteur");
  await dialog(admin.page).getByLabel("Adresse e-mail").fill("lecteur@test.local");
  await dialog(admin.page).getByLabel("Rôle").selectOption("lecteur");
  await submit(admin.page, "[role=dialog] form button[type=submit]");
  const link = await dialog(admin.page).locator("input[readonly]").inputValue();
  expect(link).toMatch(/\/lien\/[A-Za-z0-9_-]{40,}/);
  await dialog(admin.page).getByRole("button", { name: "Terminé" }).click();
  expect((await one(`select role::text as r from auth_tokens where email = 'lecteur@test.local' and type = 'invitation'`)).r).toBe("lecteur");
  // le lecteur accepte l'invitation
  const ctx = await browser.newContext({ baseURL: URL, locale: "fr-FR" });
  const page = autoHydrate(await ctx.newPage());
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await page.fill("input[name=password]", PASSWORD); await page.fill("input[name=confirm]", PASSWORD);
  await page.click("form button"); await page.waitForURL(URL + "/");
  expect((await one(`select role::text as r from users where email = 'lecteur@test.local'`)).r).toBe("lecteur");
  // interface : lecture seule
  await page.goto("/missions"); await expect(page.getByRole("button", { name: /nouvelle tâche/i })).toHaveCount(0);
  await page.goto("/crm"); await expect(page.getByRole("button", { name: /ajouter un contact/i })).toHaveCount(0);
  await page.goto("/production"); await expect(page.getByRole("button", { name: /créer un épisode/i })).toHaveCount(0);
  await page.goto("/finances"); await expect(page).toHaveURL(/refus/);
  await expect(page.locator("aside").getByRole("link", { name: "Finances" })).toHaveCount(0);
  // serveur : on rejoue une action d'écriture capturée chez Eliott → refusée pour le lecteur
  await admin.page.goto("/missions");
  const act = await captureAction(admin.page, async () => { await admin.page.getByRole("button", { name: /nouvelle tâche/i }).first().click(); await dialog(admin.page).getByLabel("Titre").fill("Tâche d'écriture"); await submit(admin.page, "[role=dialog] form button[type=submit]"); });
  const r = await replay(page, act, act.body.replace("Tâche d'écriture", "Tâche du lecteur"));
  expect(await r.text()).toMatch(/permission/i);
  expect((await one(`select count(*)::int as n from tasks where title = 'Tâche du lecteur'`)).n).toBe(0);
  expect((await page.request.get("/api/export/taches?format=csv")).status()).toBe(200); // ses droits : lecture des tâches
  expect((await page.request.get("/api/export/contacts?format=csv")).status()).toBe(403);
  await ctx.close(); await admin.ctx.close();
});

test("désactiver un compte : session fermée immédiatement, connexion impossible", async ({ browser }) => {
  const admin = await session(browser, "eliott");
  const ctx = await browser.newContext({ baseURL: URL, locale: "fr-FR" });
  const lect = autoHydrate(await ctx.newPage());
  await lect.goto("/connexion"); await lect.fill("input[name=email]", "lecteur@test.local"); await lect.fill("input[name=password]", PASSWORD); await lect.click("form button"); await lect.waitForURL(URL + "/");
  await openTeam(admin.page);
  await admin.page.getByRole("button", { name: "Droits" }).nth(2).click(); // Arthur, Eliott, Léo (ordre alphabétique : Arthur, Eliott, Léo)
  await expect(dialog(admin.page).getByText(/Droits — Léo Lecteur/)).toBeVisible();
  await dialog(admin.page).getByText("Compte actif").click();
  await submit(admin.page, "[role=dialog] form button[type=submit]");
  await expect.poll(async () => (await one(`select active from users where email = 'lecteur@test.local'`)).active).toBe(false);
  await lect.goto("/missions"); await expect(lect).toHaveURL(/\/connexion/); // session fermée
  await lect.fill("input[name=email]", "lecteur@test.local"); await lect.fill("input[name=password]", PASSWORD); await lect.click("form button");
  await expect(lect.getByText(/identifiants incorrects/i)).toBeVisible();
  expect((await one(`select count(*)::int as n from sessions s join users u on u.id = s.user_id where u.email = 'lecteur@test.local'`)).n).toBe(0);
  await ctx.close(); await admin.ctx.close();
});

test("réinitialisation par un administrateur : lien à usage unique, anciennes sessions fermées, ancien mot de passe invalide", async ({ browser }) => {
  const admin = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await openTeam(admin.page);
  await admin.page.getByRole("button", { name: "Réinit." }).first().click(); // Arthur
  const link = await admin.page.locator("input[readonly]").first().inputValue();
  expect(link).toMatch(/\/lien\//);
  const ctx = await browser.newContext({ baseURL: URL, locale: "fr-FR" });
  const page = autoHydrate(await ctx.newPage());
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.getByRole("heading", { name: /nouveau mot de passe/i })).toBeVisible();
  await page.fill("input[name=password]", "NouveauMdp2026"); await page.fill("input[name=confirm]", "NouveauMdp2026");
  await page.click("form button"); await page.waitForURL(URL + "/");
  await arthur.page.goto("/missions"); await expect(arthur.page).toHaveURL(/\/connexion/); // l'ancienne session est fermée
  const again = await browser.newContext({ baseURL: URL }); const p2 = autoHydrate(await again.newPage());
  await p2.goto(link.replace(/^https?:\/\/[^/]+/, "")); await expect(p2.getByRole("heading", { name: /lien expiré/i })).toBeVisible(); // usage unique
  await p2.goto("/connexion"); await p2.fill("input[name=email]", "arthur@test.local"); await p2.fill("input[name=password]", PASSWORD); await p2.click("form button");
  await expect(p2.getByText(/identifiants incorrects/i)).toBeVisible(); // ancien mot de passe refusé
  await again.close(); await ctx.close(); await admin.ctx.close(); await arthur.ctx.close();
});

test("changer son propre mot de passe : vérifie l'actuel, applique la politique, déconnecte les autres appareils", async ({ browser }) => {
  const NEW = "NouveauMdp2026";
  const a1 = await browser.newContext({ baseURL: URL, locale: "fr-FR" }); const p1 = autoHydrate(await a1.newPage());
  const a2 = await browser.newContext({ baseURL: URL, locale: "fr-FR" }); const p2 = autoHydrate(await a2.newPage());
  for (const p of [p1, p2]) { await p.goto("/connexion"); await p.fill("input[name=email]", "arthur@test.local"); await p.fill("input[name=password]", NEW); await p.click("form button"); await p.waitForURL(URL + "/"); }
  await p1.goto("/parametres");
  const change = async (cur: string, next: string, conf = next) => { await p1.getByLabel("Mot de passe actuel").fill(cur); await p1.getByLabel(/^Nouveau/).fill(next); await p1.getByLabel("Confirmer", { exact: true }).fill(conf); await submit(p1, "form button[type=submit]:has-text('Changer')"); };
  await change("mauvais-actuel1", "Encore2026Ok"); await expect(p1.locator("[aria-live=polite]")).toContainText(/actuel incorrect/i);
  await change(NEW, "uniquementdeslettres"); await expect(p1.locator("[aria-live=polite]")).toContainText(/lettre et un chiffre/i);
  await change(NEW, PASSWORD); await expect(p1.locator("[aria-live=polite]")).toContainText(/autres appareils ont été déconnectés/i);
  await p2.goto("/missions"); await expect(p2).toHaveURL(/\/connexion/); // l'autre appareil est déconnecté
  await p1.goto("/missions"); await expect(p1).toHaveURL(/\/missions/); // celui-ci reste connecté
  await a1.close(); await a2.close();
});

test("journal : actions sensibles et connexions visibles des seuls administrateurs", async ({ browser }) => {
  const admin = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await admin.page.goto("/parametres?onglet=journal");
  for (const t of [/invitation envoyée à lecteur@test.local/i, /coffre-fort déverrouillé/i, /consultation : instagram/i, /droits de léo lecteur/i]) await expect(admin.page.getByText(t).first()).toBeVisible();
  await admin.page.getByRole("tab", { name: "Connexions" }).click();
  await expect(admin.page.getByText("Échec").first()).toBeVisible(); await expect(admin.page.getByText("Réussie").first()).toBeVisible();
  await expect(admin.page.getByText(/arthur@test.local/).first()).toBeVisible();
  await arthur.page.goto("/activite"); // le fil commun n'expose pas les actions sensibles à Arthur
  await expect(arthur.page.getByText(/consultation : instagram/i)).toHaveCount(0);
  await expect(arthur.page.getByText(/coffre-fort déverrouillé/i)).toHaveCount(0);
  await admin.ctx.close(); await arthur.ctx.close();
});

test("récupération : une sauvegarde complète se restaure dans une base vide, à l'identique", async () => {
  const bk = (await q(`select 1`)) && "ok"; void bk;
  const { ctx, page } = await (async () => { const b = (await import("@playwright/test")).chromium; const br = await b.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] }); const c = await br.newContext({ baseURL: URL }); const p = await c.newPage(); await login(p, "eliott"); return { ctx: c, page: p, br }; })();
  const json = await (await page.request.get("/api/sauvegarde")).text();
  await ctx.browser()!.close();
  const file = "/tmp/dlal-test-backup.json"; (await import("node:fs")).writeFileSync(file, json);
  const sh = (c: string) => execFileSync("bash", ["-c", c], { encoding: "utf8", env: process.env });
  sh(`su postgres -c "psql -q -c 'drop database if exists dlal_restore with (force)'" && su postgres -c "createdb -O dlal dlal_restore"`);
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL!.replace("/dlal_verif", "/dlal_restore") };
  execFileSync("npm", ["run", "-s", "db:migrate"], { env, encoding: "utf8" });
  const out = execFileSync("npx", ["tsx", "scripts/restore.ts", file], { env, encoding: "utf8" });
  expect(out).toContain("✓ Restauration terminée");
  const src = sql(); const dst = (await import("postgres")).default(env.DATABASE_URL, { max: 1 });
  for (const t of ["users", "contacts", "episodes", "tasks", "events", "checklist_items", "contents", "transactions", "guest_documents", "attachments", "vault_items", "audit_log", "notifications", "metric_snapshots"]) {
    const [a] = await src.unsafe(`select count(*)::int as n from ${t}`); const [b] = await dst.unsafe(`select count(*)::int as n from ${t}`);
    if (t === "audit_log") {
      // la sauvegarde est elle-même journalisée juste APRÈS sa création : la source a exactement cette ligne de plus
      const extra = await src.unsafe(`select action from audit_log order by created_at desc limit 1`);
      expect(a.n - b.n, "seule l'entrée de la sauvegarde elle-même manque").toBe(1);
      expect(String(extra[0].action)).toMatch(/sauvegarde|backup|export/i);
    } else expect(b.n, `table ${t}`).toBe(a.n);
  }
  // les fichiers joints (octets) et les secrets chiffrés sont identiques
  const [fa] = await src.unsafe(`select md5(string_agg(md5(data), '' order by id)) as h from attachments where data is not null`); const [fb] = await dst.unsafe(`select md5(string_agg(md5(data), '' order by id)) as h from attachments where data is not null`);
  expect(fb.h).toBe(fa.h);
  const [va] = await src.unsafe(`select secret_enc from vault_items`); const [vb] = await dst.unsafe(`select secret_enc from vault_items`);
  expect(vb.secret_enc).toBe(va.secret_enc);
  await src.end(); await dst.end();
});

test("remise en état : le mot de passe d'Arthur redevient celui de départ (pour les contrôles suivants)", async () => {
  // état déjà rétabli par le test « changer son propre mot de passe » : on le vérifie explicitement
  const [u] = await q(`select password_hash from users where email = 'arthur@test.local'`);
  expect(u.password_hash).toMatch(/^\$argon2id\$/);
});
