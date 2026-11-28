import { test, expect, type Browser, type Page } from "@playwright/test";
import { EMAIL, PASSWORD, URL, session, sql, dialog, submit } from "./helpers";

const PAGES = ["/", "/missions", "/crm", "/production", "/calendrier", "/contenus", "/checklists", "/finances", "/statistiques", "/idees", "/ressources", "/ressources/coffre-fort", "/drive", "/activite", "/parametres", "/a-ne-pas-oublier"];

/** Collecte toutes les erreurs JavaScript et réponses 5xx d'une page. */
function surveille(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("JS: " + e.message.slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  return errs;
}

test("connexion SANS JavaScript : formulaire classique, session ouverte", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL: URL, locale: "fr-FR" });
  const page = await ctx.newPage();
  await page.goto("/connexion");
  await page.fill("input[name=email]", EMAIL.eliott);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button");
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20_000 });
  await expect(page.locator("aside").first()).toContainText("Vue d'ensemble");
  const sess = sql(); const [{ n }] = await sess`select count(*)::int as n from sessions where expires_at > now()`; await sess.end(); expect(n).toBeGreaterThan(0);
  await ctx.close();
});

test("connexion : mauvais mot de passe → message, e-mail conservé, mot de passe jamais renvoyé ; redirection « next » sûre", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: URL, locale: "fr-FR" });
  const page = await ctx.newPage();
  await page.goto("/connexion?next=//evil.example");
  await page.fill("input[name=email]", EMAIL.eliott);
  await page.fill("input[name=password]", "pas-le-bon-mot-de-passe-1");
  await page.click("form button");
  await expect(page.locator("p[role=alert]")).toContainText(/identifiants incorrects/i);
  await expect(page.locator("input[name=email]")).toHaveValue(EMAIL.eliott);
  await expect(page.locator("input[name=password]")).toHaveValue("");
  expect(await page.content()).not.toContain("pas-le-bon-mot-de-passe-1");
  // un « next » malveillant est ignoré
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button");
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"));
  expect(new globalThis.URL(page.url()).origin).toBe(new globalThis.URL(URL).origin);
  const d = sql(); await d`delete from login_events where success = false`; await d.end(); // ne pas bloquer l'IP de test
  await ctx.close();
});

test("connexion : envoi depuis un autre site refusé ; compteur de synchro réservé aux connectés", async ({ request }) => {
  const r = await request.post(`${URL}/api/connexion`, { form: { email: EMAIL.eliott, password: PASSWORD }, headers: { Origin: "https://pirate.example" }, maxRedirects: 0 });
  expect(r.status()).toBe(403);
  expect((await request.get(`${URL}/api/sync`)).status()).toBe(401);
});

test("session : survit à la fermeture du navigateur (cookie persistant), à l'actualisation et au changement de page", async ({ browser }) => {
  const a = await session(browser, "eliott");
  const state = await a.ctx.storageState();
  const cookie = state.cookies.find((c) => c.name === "dlal_session")!;
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 20 * 86400); // ~30 jours
  expect(cookie.httpOnly).toBe(true);
  await a.ctx.close(); // « fermeture du navigateur »
  const ctx2 = await browser.newContext({ storageState: state, baseURL: URL, locale: "fr-FR" });
  const p = await ctx2.newPage();
  await p.goto("/missions");
  await expect(p).toHaveURL(/\/missions/);
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  await p.reload();
  await expect(p).toHaveURL(/\/missions/);
  await ctx2.close();
});

test("session : déconnexion ferme la session côté serveur ; session expirée → retour à la connexion sans erreur", async ({ browser }) => {
  const a = await session(browser, "eliott");
  const state = await a.ctx.storageState();
  // deux appareils, même compte
  const b = await browser.newContext({ storageState: state, baseURL: URL }); const pb = await b.newPage();
  await pb.goto("/"); await expect(pb).toHaveURL(URL + "/");
  // expiration forcée en base
  const d = sql();
  await d`update sessions set expires_at = now() - interval '1 minute' where user_id = (select id from users where email = ${EMAIL.eliott}) and expires_at > now()`;
  await pb.goto("/missions");
  await expect(pb).toHaveURL(/\/connexion/);
  await expect(pb.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await d.end(); await a.ctx.close(); await b.close();
});

test("déconnexion volontaire : session supprimée en base, retour impossible avec l'ancien cookie", async ({ browser }) => {
  const a = await session(browser, "eliott");
  const state = await a.ctx.storageState();
  const before = sql(); const [{ n: n0 }] = await before`select count(*)::int as n from sessions where expires_at > now()`; await before.end();
  await a.page.getByRole("button", { name: "Mon compte" }).click();
  await a.page.getByRole("button", { name: /se déconnecter/i }).click();
  await a.page.waitForURL(/\/connexion/);
  const after = sql(); const [{ n: n1 }] = await after`select count(*)::int as n from sessions where expires_at > now()`; await after.end();
  expect(n1).toBeLessThan(n0);
  const old = await browser.newContext({ storageState: state, baseURL: URL }); const p = await old.newPage();
  await p.goto("/missions"); await expect(p).toHaveURL(/\/connexion/);
  await old.close(); await a.ctx.close();
});

test("navigation prolongée : 3 tours des 16 pages, rafraîchissements, aucune erreur JavaScript ni 5xx", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await session(browser, "eliott");
  const errs = surveille(page);
  for (let tour = 0; tour < 3; tour++) {
    for (const u of PAGES) {
      await page.goto(u);
      await expect(page.locator("main, [role=main]").first()).toBeVisible();
      await expect(page.getByText(/on a perdu le signal|application error/i)).toHaveCount(0);
    }
    await page.reload();
  }
  // navigation interne (clics dans le menu, sans rechargement complet)
  await page.goto("/");
  for (const nom of ["Mes missions", "Invités & CRM", "Production", "Calendrier éditorial", "Contenus", "Finances", "Statistiques", "Vue d'ensemble"]) {
    await page.locator("aside").getByRole("link", { name: nom, exact: true }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/on a perdu le signal/i)).toHaveCount(0);
  }
  expect(errs, errs.join("\n")).toEqual([]);
  await ctx.close();
});

test("réseau lent (3G dégradée) : connexion et navigation aboutissent", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ baseURL: URL, locale: "fr-FR" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (200 * 1024) / 8 });
  await page.goto("/connexion", { timeout: 60_000 });
  await page.fill("input[name=email]", EMAIL.eliott);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button");
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 90_000 });
  await expect(page.locator("aside").first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/missions", { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await ctx.close();
});

test("coupure puis retour du réseau : indicateur « liaison de secours », puis resynchronisation automatique", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/missions");
  await expect(page.getByText(/à l.antenne/i).first()).toBeVisible({ timeout: 20_000 });
  await ctx.setOffline(true);
  await expect(page.getByText(/liaison de secours/i).first()).toBeVisible({ timeout: 20_000 });
  // pendant la coupure, une modification est faite ailleurs (directement en base)
  const titre = `Pendant la coupure ${Date.now()}`;
  const d = sql();
  const [u] = await d`select id from users where email = ${EMAIL.eliott}`;
  await d`insert into tasks (title, status, priority, assignee_id, created_by) values (${titre}, 'a_faire', 'normale', ${u.id}, ${u.id})`;
  await ctx.setOffline(false);
  await expect(page.getByText(/à l.antenne/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(titre).first()).toBeVisible({ timeout: 20_000 });
  await d`delete from tasks where title = ${titre}`; await d.end();
  await ctx.close();
});

test("changement d'appareil : deux appareils du même compte voient la même chose en direct (ajout, modification, suppression)", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000);
  const mac = await session(browser, "eliott");
  const ipad = await (async () => { const c = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true, baseURL: URL, locale: "fr-FR" }); const p = await c.newPage(); await p.goto("/connexion"); await p.fill("input[name=email]", EMAIL.eliott); await p.fill("input[name=password]", PASSWORD); await p.click("form button"); await p.waitForURL((u) => !u.pathname.startsWith("/connexion")); return { c, p }; })();
  await mac.page.goto("/missions"); await ipad.p.goto("/missions");
  const titre = `Tâche inter-appareils ${Date.now()}`;
  await mac.page.getByRole("button", { name: /nouvelle tâche/i }).first().click();
  await dialog(mac.page).getByLabel("Titre").fill(titre);
  await submit(mac.page, "[role=dialog] form button[type=submit]");
  await expect(ipad.p.getByText(titre).first()).toBeVisible({ timeout: 20_000 });
  const d = sql(); await d`update tasks set title = ${titre + " (modifiée)"} where title = ${titre}`;
  await expect(mac.page.getByText(titre + " (modifiée)").first()).toBeVisible({ timeout: 20_000 });
  await expect(ipad.p.getByText(titre + " (modifiée)").first()).toBeVisible({ timeout: 20_000 });
  await d`delete from tasks where title = ${titre + " (modifiée)"}`; await d.end();
  await expect(ipad.p.getByText(titre + " (modifiée)")).toHaveCount(0, { timeout: 20_000 });
  await mac.ctx.close(); await ipad.c.close();
});

test("création, modification et suppression : persistance après rechargement et après reconnexion complète", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await session(browser, "eliott");
  await a.page.goto("/crm");
  const nom = `Persistance${Date.now()}`;
  await a.page.getByRole("button", { name: /ajouter un invité|nouveau contact|ajouter/i }).first().click();
  await dialog(a.page).getByLabel("Prénom").fill("Test");
  await dialog(a.page).getByLabel("Nom", { exact: true }).fill(nom);
  await submit(a.page, "[role=dialog] form button[type=submit]");
  await a.page.reload();
  await expect(a.page.getByText(nom).first()).toBeVisible();
  await a.ctx.close();
  const b = await session(browser, "eliott"); // reconnexion complète, nouveau contexte
  await b.page.goto("/crm");
  await expect(b.page.getByText(nom).first()).toBeVisible();
  const d = sql(); const [{ n }] = await d`select count(*)::int as n from contacts where last_name = ${nom}`; expect(n).toBe(1);
  await d`delete from contacts where last_name = ${nom}`; await d.end();
  await b.ctx.close();
});
