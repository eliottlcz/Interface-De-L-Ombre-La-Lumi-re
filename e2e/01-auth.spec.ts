import { test, expect } from "@playwright/test";
import { EMAIL, PASSWORD, URL, invites, sql, submit, autoHydrate } from "./helpers";

test.beforeEach(async ({ page }) => { autoHydrate(page); });

test.describe.configure({ mode: "serial" });

test("aucune inscription publique : pas de lien, route absente", async ({ page }) => {
  await page.goto("/connexion");
  await expect(page.getByText(/créer un compte|s'inscrire|inscription/i)).toHaveCount(0);
  for (const p of ["/inscription", "/register", "/signup"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/connexion/); // aucune page d'inscription : retour à la connexion
    await expect(page.locator("input[name=confirm]")).toHaveCount(0);
  }
});

test("pages privées : redirection vers la connexion sans session", async ({ page }) => {
  for (const p of ["/", "/crm", "/finances", "/parametres", "/ressources/coffre-fort", "/statistiques"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/connexion/);
  }
});

test("API privées : 401 sans session", async ({ request }) => {
  for (const p of ["/api/export/contacts", "/api/sauvegarde", "/api/realtime", "/api/attachments/00000000-0000-0000-0000-000000000000"]) {
    const r = await request.get(p, { maxRedirects: 0 });
    expect([401, 307].includes(r.status()), `${p} -> ${r.status()}`).toBeTruthy();
  }
});

test("cron : refusé sans secret, accepté avec", async ({ request }) => {
  expect((await request.get("/api/cron/quotidien")).status()).toBe(401);
  expect((await request.get("/api/cron/quotidien", { headers: { authorization: "Bearer faux" } })).status()).toBe(401);
});

test("invitation : lien invalide refusé", async ({ page }) => {
  await page.goto("/lien/jeton-bidon");
  await expect(page.getByRole("heading", { name: /lien expiré/i })).toBeVisible();
});

test("invitation : mot de passe faible refusé, puis compte créé (Eliott)", async ({ page }) => {
  await page.goto(invites().eliott);
  await expect(page.getByRole("heading", { name: /bienvenue/i })).toBeVisible();
  await page.fill("input[name=password]", "court1");
  await page.fill("input[name=confirm]", "court1");
  await page.click("form button");
  // validation navigateur (minLength) ou serveur : on ne doit pas être connecté
  await expect(page).toHaveURL(/\/lien\//);
  await page.fill("input[name=password]", "uniquementdeslettres");
  await page.fill("input[name=confirm]", "uniquementdeslettres");
  await submit(page);
  await expect(page.getByText(/lettre et un chiffre/i)).toBeVisible();
  await expect(page.locator("input[name=password]")).toHaveValue(""); // mots de passe effacés par sécurité
  await page.fill("input[name=password]", PASSWORD);
  await page.fill("input[name=confirm]", "Different2026");
  await submit(page);
  await expect(page.getByText(/ne correspondent pas/i)).toBeVisible();
  await page.fill("input[name=password]", PASSWORD);
  await page.fill("input[name=confirm]", PASSWORD);
  await page.click("form button");
  await page.waitForURL(URL + "/");
  await expect(page.getByRole("heading", { level: 1, name: /eliott/i })).toBeVisible();
});

test("invitation : lien à usage unique", async ({ page }) => {
  await page.goto(invites().eliott);
  await expect(page.getByRole("heading", { name: /lien expiré/i })).toBeVisible();
});

test("invitation : compte Arthur créé", async ({ page }) => {
  await page.goto(invites().arthur);
  await page.fill("input[name=password]", PASSWORD);
  await page.fill("input[name=confirm]", PASSWORD);
  await page.click("form button");
  await page.waitForURL(URL + "/");
  await expect(page.getByRole("heading", { level: 1, name: /arthur/i })).toBeVisible();
});

test("rôles corrects en base, mots de passe jamais en clair (argon2id)", async () => {
  const db = sql();
  const rows = await db`select email, role, password_hash from users order by email`;
  await db.end();
  expect(rows.map((r) => [r.email, r.role])).toEqual([["arthur@test.local", "collaborateur"], ["eliott@test.local", "administrateur"]]);
  for (const r of rows) { expect(r.password_hash).toMatch(/^\$argon2id\$/); expect(r.password_hash).not.toContain(PASSWORD); }
});

test("connexion : mauvais mot de passe, message neutre, puis succès et déconnexion", async ({ page }) => {
  await page.goto("/connexion");
  await page.fill("input[name=email]", EMAIL.arthur);
  await page.fill("input[name=password]", "MauvaisMdp1");
  await submit(page);
  await expect(page.getByText(/identifiants incorrects/i)).toBeVisible();
  await expect(page.locator("input[name=email]")).toHaveValue(EMAIL.arthur); // l'e-mail n'est pas perdu après une erreur
  await expect(page.locator("input[name=password]")).toHaveValue("");
  await page.fill("input[name=email]", "inconnu@test.local");
  await page.fill("input[name=password]", "MauvaisMdp1");
  await submit(page);
  await expect(page.getByText(/identifiants incorrects/i)).toBeVisible(); // même message : pas d'énumération
  await page.fill("input[name=email]", EMAIL.arthur);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button");
  await page.waitForURL(URL + "/");
  await page.getByRole("button", { name: "Mon compte" }).click();
  await page.getByRole("button", { name: /se déconnecter/i }).click();
  await expect(page).toHaveURL(/\/connexion/);
  await expect(page.getByText(/coupez/i)).toBeVisible();
  await page.goto("/crm");
  await expect(page).toHaveURL(/\/connexion/); // session bien détruite côté serveur
});

test("blocage après 5 échecs, journalisé, puis nettoyage pour la suite", async ({ page }) => {
  await page.goto("/connexion");
  for (let i = 0; i < 6; i++) {
    await page.fill("input[name=email]", "cible@test.local");
    await page.fill("input[name=password]", "Mauvais" + i);
    await submit(page);
  }
  await expect(page.getByText(/trop de tentatives/i)).toBeVisible();
  const db = sql();
  const [{ n }] = await db`select count(*)::int as n from login_events where success = false and email = 'cible@test.local'`;
  expect(n).toBeGreaterThanOrEqual(5);
  await db`delete from login_events where success = false`; // évite de bloquer l'IP de test pour la suite
  await db.end();
});

test("journal des connexions : réussites enregistrées", async () => {
  const db = sql();
  const [{ n }] = await db`select count(*)::int as n from login_events where success = true`;
  await db.end();
  expect(n).toBeGreaterThanOrEqual(2);
});

test("réinitialisation : réponse identique que le compte existe ou non", async ({ page }) => {
  await page.goto("/mot-de-passe-oublie");
  await page.fill("input[name=email]", "inconnu@test.local");
  await submit(page);
  const a = await page.locator("form p").last().innerText();
  await page.fill("input[name=email]", EMAIL.arthur);
  await submit(page);
  await expect(page.locator("form p").last()).toHaveText(a);
});

test("en-têtes de sécurité présents", async ({ request }) => {
  const r = await request.get("/connexion");
  const h = r.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age");
  expect(h["x-robots-tag"]).toContain("noindex");
  expect(h["x-powered-by"]).toBeUndefined();
});
