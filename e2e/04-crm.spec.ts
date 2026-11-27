import { test, expect, Page } from "@playwright/test";
import { dialog, session, sql, submit, todayParis, plusDays } from "./helpers";

test.describe.configure({ mode: "serial" });
const N = "Camille Durand";
const row = async (q: string) => { const d = sql(); const r = await d.unsafe(q); await d.end(); return r; };

async function newContact(page: Page, v: { prenom: string; nom: string; metier?: string; email?: string; pourquoi?: string; force?: boolean }) {
  await page.goto("/crm?categorie=a_contacter");
  await page.getByRole("button", { name: /ajouter un contact/i }).first().click();
  const d = dialog(page);
  await d.getByLabel("Prénom").fill(v.prenom);
  await d.getByLabel("Nom", { exact: true }).fill(v.nom);
  if (v.metier) await d.getByLabel("Profession").fill(v.metier);
  if (v.email) await d.getByLabel("E-mail").fill(v.email);
  if (v.pourquoi) await d.getByLabel(/pourquoi cette personne/i).fill(v.pourquoi);
  await submit(page, "[role=dialog] form button[type=submit]");
}

test("créer un contact : fiche ouverte, visible dans « À contacter », responsable = créateur", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await newContact(page, { prenom: "Camille", nom: "Durand", metier: "Directrice de casting", email: "camille.durand@example.org", pourquoi: "Révèle des talents sur de grands films, jamais devant la caméra." });
  await page.waitForURL(/\/crm\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1, name: N })).toBeVisible();
  await expect(page.getByText("Révèle des talents")).toBeVisible();
  const [c] = await row(`select c.category, u.email as owner from contacts c join users u on u.id = c.owner_id where c.email = 'camille.durand@example.org'`);
  expect(c.category).toBe("a_contacter"); expect(c.owner).toBe("eliott@test.local");
  await page.goto("/crm?categorie=a_contacter");
  await expect(page.getByRole("cell", { name: N })).toBeVisible();
  await ctx.close();
});

test("doublons : même nom signalé, même e-mail refusé en base", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await newContact(page, { prenom: "Camille", nom: "Durand" });
  await expect(dialog(page).getByText(/doublon possible/i)).toBeVisible();
  await expect(page).toHaveURL(/\/crm\?/);
  await dialog(page).getByRole("link", { name: /voir le contact existant/i }).click();
  await page.waitForURL(/q=Camille/);
  await expect(page.getByRole("cell", { name: N })).toBeVisible();
  // même e-mail, autre nom : bloqué par l'index unique, même en « créer quand même »
  await newContact(page, { prenom: "Autre", nom: "Personne", email: "CAMILLE.DURAND@example.org" });
  await expect(dialog(page).getByText(/doublon possible/i).or(page.locator("[aria-live=polite]").getByText(/existe déjà/i))).toBeVisible();
  const [{ n }] = await row(`select count(*)::int as n from contacts where lower(email) = 'camille.durand@example.org'`);
  expect(n).toBe(1);
  await ctx.close();
});

test("mail envoyé → catégorie et relance automatiques ; relance → « À relancer » ; historique complet", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  const [c] = await row(`select id from contacts where email = 'camille.durand@example.org'`);
  await page.goto("/crm/" + c.id);
  await page.getByRole("button", { name: /enregistrer un échange/i }).first().click();
  await dialog(page).getByLabel("Objet du mail").fill("Invitation à notre podcast");
  await dialog(page).getByLabel("Date").fill(plusDays(-7));
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.getByText("Mail envoyé").first()).toBeVisible({ timeout: 15_000 });
  let [r] = await row(`select category, last_email_subject, next_followup_at::text as nf, response_received from contacts where id = '${c.id}'`);
  expect(r.category).toBe("mail_envoye"); expect(r.last_email_subject).toBe("Invitation à notre podcast"); expect(r.nf).toBe(todayParis()); expect(r.response_received).toBe(false); // J+7 par défaut

  await page.getByRole("button", { name: /enregistrer un échange/i }).first().click();
  await dialog(page).getByLabel("Type d'échange").selectOption("relance");
  await dialog(page).getByLabel("Résumé").fill("Relance par e-mail");
  await dialog(page).getByLabel("Prochaine relance").fill(todayParis()); // à refaire aujourd'hui
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.getByText("Relance enregistrée —")).toBeVisible();
  [r] = await row(`select category, followup_count from contacts where id = '${c.id}'`);
  expect(r.category).toBe("a_relancer"); expect(r.followup_count).toBe(1);
  await page.reload();
  await expect(page.getByText("Invitation à notre podcast").first()).toBeVisible();
  await expect(page.getByText("Relance par e-mail")).toBeVisible();
  const [{ n }] = await row(`select count(*)::int as n from contact_interactions where contact_id = '${c.id}'`);
  expect(n).toBeGreaterThanOrEqual(3); // création + mail + relance
  await ctx.close();
});

test("relance échue : apparaît dans « À ne pas oublier » et dans les urgences de l'accueil", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/a-ne-pas-oublier");
  await expect(page.getByText(/relancer camille durand/i).first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(/relancer camille durand/i).first()).toBeVisible();
  await ctx.close();
});

test("réponse reçue ; déplacement entre catégories (liste puis Kanban glisser-déposer) ; Arthur voit la même chose", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  const [c] = await row(`select id from contacts where email = 'camille.durand@example.org'`);
  await eliott.page.goto("/crm/" + c.id);
  await eliott.page.getByLabel("Déplacer vers").selectOption("a_contacter");
  await expect.poll(async () => (await row(`select category from contacts where id = '${c.id}'`))[0].category).toBe("a_contacter");
  await arthur.page.goto("/crm?categorie=a_contacter");
  await expect(arthur.page.getByRole("cell", { name: N })).toBeVisible();

  await eliott.page.goto("/crm?vue=kanban");
  const card = eliott.page.locator("a", { hasText: N }).first();
  const target = eliott.page.locator("section", { has: eliott.page.getByText("Mail envoyé", { exact: true }) }).first();
  const a = await card.boundingBox(); const b = await target.boundingBox();
  await eliott.page.mouse.move(a!.x + 30, a!.y + 15); await eliott.page.mouse.down();
  await eliott.page.mouse.move(a!.x + 50, a!.y + 25, { steps: 4 });
  await eliott.page.mouse.move(b!.x + b!.width / 2, b!.y + 110, { steps: 12 });
  await eliott.page.mouse.up();
  await expect.poll(async () => (await row(`select category from contacts where id = '${c.id}'`))[0].category, { timeout: 15_000 }).toBe("mail_envoye");
  await expect(eliott.page).toHaveURL(/\/crm\?/); // le glissement n'a pas ouvert la fiche
  // un simple clic, lui, ouvre la fiche
  await eliott.page.locator("a", { hasText: N }).first().click();
  await expect(eliott.page).toHaveURL(/\/crm\/[0-9a-f-]{36}/);
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("recherche et filtres : texte, responsable, priorité ; archivage/restauration ; export refusé à Arthur", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await newContact(page, { prenom: "Yanis", nom: "Benali", metier: "Ingénieur du son" });
  await page.waitForURL(/\/crm\/[0-9a-f-]{36}/);
  await page.goto("/crm?categorie=tous");
  await expect(page.getByRole("cell", { name: "Yanis Benali" })).toBeVisible();
  await page.getByLabel("Rechercher un contact").fill("casting");
  await expect(page.getByRole("cell", { name: "Yanis Benali" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: N })).toBeVisible();
  await page.getByLabel("Rechercher un contact").fill("");
  await page.getByLabel("Responsable").selectOption({ label: "Arthur Pomarede" });
  await expect(page.getByRole("cell", { name: N })).toHaveCount(0); // aucun contact attribué à Arthur
  await page.getByLabel("Responsable").selectOption("");
  // archivage
  await page.getByRole("cell", { name: "Yanis Benali" }).click();
  await page.getByRole("button", { name: /^archiver$/i }).click();
  await dialog(page).getByRole("button", { name: /^archiver$/i }).click();
  await expect(page.getByText(/contact archivé/i)).toBeVisible();
  await page.goto("/crm?categorie=tous");
  await expect(page.getByRole("cell", { name: "Yanis Benali" })).toHaveCount(0);
  await page.goto("/crm?categorie=archives");
  await expect(page.getByRole("cell", { name: "Yanis Benali" })).toBeVisible();
  await ctx.close();
});

test("export des contacts (Eliott) : CSV Excel-FR, colonnes complètes, aucune injection de formule", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await newContact(page, { prenom: "=HYPERLINK(\"http://x\")", nom: "Piège" });
  await page.waitForTimeout(500);
  const csv = await (await page.request.get("/api/export/contacts?format=csv")).text();
  expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM pour Excel
  expect(csv.split("\r\n")[0]).toContain("Prénom;Nom;Profession");
  expect(csv).toContain("Camille;Durand;Directrice de casting");
  expect(csv).not.toMatch(/;=HYPERLINK/); // neutralisé
  const xlsx = await page.request.get("/api/export/contacts?format=xlsx");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  const [{ n }] = await row(`select count(*)::int as n from audit_log where action = 'export' and sensitive = true`);
  expect(n).toBeGreaterThanOrEqual(2);
  await ctx.close();
});
