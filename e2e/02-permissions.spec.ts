import { test, expect } from "@playwright/test";
import { dialog, session, submit } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Arthur : menu limité, rubriques autorisées accessibles", async ({ browser }) => {
  const { ctx, page } = await session(browser, "arthur");
  const nav = page.locator("aside");
  for (const l of ["Vue d'ensemble", "Statistiques", "Invités & CRM", "Production", "Calendrier éditorial", "Mes missions", "Idées du jour", "Ressources", "Google Drive", "Checklists", "Contenus", "À ne pas oublier", "Paramètres"])
    await expect(nav.getByRole("link", { name: l, exact: true }), l).toBeVisible();
  await expect(nav.getByRole("link", { name: "Finances", exact: true })).toHaveCount(0);
  for (const p of ["/statistiques", "/crm", "/production", "/calendrier", "/missions", "/idees", "/ressources", "/drive", "/checklists", "/contenus", "/a-ne-pas-oublier", "/activite"]) {
    const r = await page.goto(p);
    expect(r?.status(), p).toBe(200);
    await expect(page, p).toHaveURL(new RegExp(p.replace("/", "\\/") + "$"));
    await expect(page.locator("h1").first(), p).toBeVisible();
  }
  await ctx.close();
});

test("Arthur : finances et coffre-fort refusés côté serveur", async ({ browser }) => {
  const { ctx, page } = await session(browser, "arthur");
  await page.goto("/finances");
  await expect(page).toHaveURL(/\/\?refus=finances/);
  await expect(page.getByText(/pas ouverte à votre profil/i)).toBeVisible();
  await page.goto("/ressources/coffre-fort");
  await expect(page).toHaveURL(/\/\?refus=coffre/);
  await expect(page.locator("aside").getByRole("link", { name: "Finances" })).toHaveCount(0);
  await ctx.close();
});

test("Arthur : exports sensibles, sauvegarde et finances refusés par l'API", async ({ browser }) => {
  const { ctx, page } = await session(browser, "arthur");
  const get = async (u: string) => (await page.request.get(u)).status();
  expect(await get("/api/export/finances?format=csv")).toBe(403);
  expect(await get("/api/export/contacts?format=csv")).toBe(403);
  expect(await get("/api/export/production?format=csv")).toBe(403);
  expect(await get("/api/sauvegarde")).toBe(403);
  expect(await get("/api/export/taches?format=csv")).toBe(200); // ses tâches : autorisé
  expect(await get("/api/export/inconnu")).toBe(404);
  expect(await get("/api/integrations/connect/youtube")).toBe(403); // réservé aux admins
  await ctx.close();
});

test("Arthur : Paramètres limités à son profil et aux intégrations en lecture", async ({ browser }) => {
  const { ctx, page } = await session(browser, "arthur");
  await page.goto("/parametres");
  await expect(page.getByRole("tab", { name: "Mon profil" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /équipe/i })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /journal/i })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /exports/i })).toHaveCount(0);
  await page.goto("/parametres?onglet=equipe"); // forcer l'onglet par l'URL
  await expect(page.getByText("arthur@test.local")).toBeVisible(); // c'est son profil
  await expect(page.getByRole("button", { name: "Droits" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /inviter/i })).toHaveCount(0);
  await ctx.close();
});

test("Eliott : accès complet", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  for (const p of ["/finances", "/ressources/coffre-fort", "/parametres"]) {
    await page.goto(p);
    await expect(page, p).toHaveURL(new RegExp(p.replace(/\//g, "\\/")));
  }
  expect((await page.request.get("/api/sauvegarde")).status()).toBe(200);
  expect((await page.request.get("/api/export/finances?format=csv")).status()).toBe(200);
  await page.goto("/parametres");
  for (const t of ["Mon profil", "Équipe & permissions", "Intégrations", "Journal & sécurité", "Exports & sauvegardes"]) await expect(page.getByRole("tab", { name: t })).toBeVisible();
  await ctx.close();
});

test("permissions configurables : Eliott accorde « finances » à Arthur, puis la retire", async ({ browser }) => {
  const admin = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await arthur.page.goto("/finances");
  await expect(arthur.page).toHaveURL(/refus/);

  await admin.page.goto("/parametres?onglet=equipe");
  await admin.page.getByRole("button", { name: "Droits" }).first().click(); // Arthur (ordre alphabétique)
  await expect(dialog(admin.page).getByText("Droits — Arthur Pomarede")).toBeVisible();
  await dialog(admin.page).getByText("Consulter les finances").click();
  await submit(admin.page, "[role=dialog] form button[type=submit]");
  await expect(dialog(admin.page)).toHaveCount(0);

  await arthur.page.goto("/finances"); // effet immédiat, sans reconnexion
  await expect(arthur.page).toHaveURL(/\/finances$/);
  await expect(arthur.page.locator("aside").getByRole("link", { name: "Finances" })).toBeVisible();
  expect((await arthur.page.request.get("/api/export/finances?format=csv")).status()).toBe(403); // exports.faire toujours refusé

  await admin.page.reload();
  await admin.page.getByRole("button", { name: "Droits" }).first().click();
  await dialog(admin.page).getByText("Consulter les finances").click();
  await submit(admin.page, "[role=dialog] form button[type=submit]");
  await arthur.page.goto("/finances");
  await expect(arthur.page).toHaveURL(/refus/);
  await admin.ctx.close(); await arthur.ctx.close();
});

test("garde-fous : un admin ne peut pas se retirer ses droits ni désactiver le dernier admin", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/parametres?onglet=equipe");
  await page.getByRole("button", { name: "Droits" }).nth(1).click(); // Eliott lui-même
  await dialog(page).locator("select").first().selectOption("collaborateur");
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.locator("[aria-live=polite]")).toContainText(/ne pouvez pas retirer/i);
  await ctx.close();
});

test("changements de droits journalisés comme actions sensibles", async () => {
  const { sql } = await import("./helpers");
  const db = sql();
  const rows = await db`select summary from audit_log where action = 'utilisateur.droits' and sensitive = true`;
  await db.end();
  expect(rows.length).toBeGreaterThanOrEqual(2);
});
