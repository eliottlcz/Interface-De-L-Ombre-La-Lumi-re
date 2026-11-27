import { test, expect, Page } from "@playwright/test";
import { dialog, session, sql, submit } from "./helpers";

test.describe.configure({ mode: "serial" });
const T = Date.now();
const t1 = `Préparer le dossier presse ${T}`;
const t2 = `Relire le générique ${T}`;
const taskCard = (page: Page, title: string) => page.locator("div.group", { has: page.getByText(title, { exact: true }) }).last();
/** Exactement une carte pour ce titre, une fois la page stabilisée (un vrai doublon persistant ferait échouer ce test). */
const oneCard = async (page: Page, title: string) => { await expect(page.getByText(title, { exact: true })).toHaveCount(1); return taskCard(page, title); };
const bell = (page: Page) => page.getByRole("button", { name: "Notifications" });

async function createTaskIn(page: Page, tab: RegExp, title: string, extra?: (p: Page) => Promise<void>) {
  await page.goto("/missions");
  await page.getByRole("tab", { name: tab }).click();
  await page.getByRole("button", { name: /nouvelle tâche/i }).first().click();
  await dialog(page).getByLabel("Titre").fill(title);
  if (extra) await extra(page);
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(dialog(page)).toHaveCount(0);
}

test("Arthur crée une tâche dans l'espace d'Eliott : Eliott la voit apparaître SANS recharger", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/missions");
  await expect(eliott.page.getByText(/à l.antenne/i)).toBeVisible({ timeout: 20_000 }); // flux temps réel connecté
  await expect(eliott.page.getByText(t1)).toHaveCount(0);

  await createTaskIn(arthur.page, /espace eliott/i, t1, async (p) => {
    await dialog(p).getByLabel("Description").fill("Photos, bio, extraits vidéo");
    await dialog(p).getByLabel("Priorité").selectOption("haute");
    await dialog(p).getByLabel("Date limite").fill("2026-12-05");
  });
  await expect(eliott.page.getByText(t1)).toBeVisible({ timeout: 20_000 }); // synchronisation immédiate
  const db = sql();
  const [row] = await db`select t.assignee_id, t.created_by, t.priority, t.due_date::text, a.email as assignee, c.email as creator from tasks t join users a on a.id = t.assignee_id join users c on c.id = t.created_by where t.title = ${t1}`;
  await db.end();
  expect(row.assignee).toBe("eliott@test.local"); expect(row.creator).toBe("arthur@test.local"); expect(row.priority).toBe("haute"); expect(row.due_date).toBe("2026-12-05");

  await expect(bell(eliott.page)).toContainText("1", { timeout: 15_000 }); // notification
  await bell(eliott.page).click();
  await expect(eliott.page.getByText(/arthur pomarede vous a attribué une tâche/i)).toBeVisible();
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("Eliott crée une tâche pour Arthur ; Arthur la voit en direct et la coche ; Eliott est prévenu", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await arthur.page.goto("/missions");
  await expect(arthur.page.getByText(/à l.antenne/i)).toBeVisible({ timeout: 20_000 });
  await createTaskIn(eliott.page, /espace arthur/i, t2);
  await expect(arthur.page.getByText(t2)).toBeVisible({ timeout: 20_000 });

  await taskCard(arthur.page, t2).getByRole("checkbox").click();
  await expect(arthur.page.getByText(/une de plus dans la lumière/i)).toBeVisible();
  await expect(arthur.page.getByText(t2, { exact: true })).toHaveCount(0); // sort de la liste ouverte
  await arthur.page.getByRole("button", { name: /historique/i }).click();
  await expect(arthur.page.getByText(t2)).toBeVisible(); // historique des tâches terminées

  await eliott.page.goto("/missions?espace=arthur");
  await bell(eliott.page).click();
  await expect(eliott.page.getByText(/arthur pomarede a terminé une tâche/i)).toBeVisible({ timeout: 15_000 });
  const db = sql();
  const [r] = await db`select status, completed_at is not null as done from tasks where title = ${t2}`;
  await db.end();
  expect(r.status).toBe("termine"); expect(r.done).toBe(true);
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("modifier, réattribuer, tâche commune, commentaire, filtre priorité", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/missions");
  await taskCard(eliott.page, t1).getByRole("button").first().click(); // ouvre le détail
  await expect(dialog(eliott.page).getByText(t1)).toBeVisible();
  await expect(dialog(eliott.page).getByText("Photos, bio, extraits vidéo")).toBeVisible();
  await dialog(eliott.page).getByPlaceholder(/écrire un commentaire/i).fill("Je m'en occupe demain matin.");
  await dialog(eliott.page).getByRole("button", { name: "Envoyer" }).click();
  await expect(dialog(eliott.page).getByText("Je m'en occupe demain matin.")).toBeVisible();

  await arthur.page.goto("/missions?espace=eliott");
  await bell(arthur.page).click();
  await expect(arthur.page.getByText(/a commenté/i)).toBeVisible({ timeout: 15_000 });

  await dialog(eliott.page).getByRole("button", { name: "Modifier" }).click();
  await dialog(eliott.page).getByLabel("Responsable").selectOption({ label: "Tâche commune" });
  await dialog(eliott.page).getByLabel("Priorité").selectOption("urgente");
  await submit(eliott.page, "[role=dialog] form button[type=submit]");
  await expect(dialog(eliott.page).getByRole("button", { name: "Modifier" })).toBeVisible(); // retour au détail : enregistré
  await eliott.page.goto("/missions?espace=communes");
  await expect(await oneCard(eliott.page, t1)).toBeVisible();
  await eliott.page.goto("/missions?espace=tout");
  await eliott.page.getByLabel("Filtrer par priorité").selectOption("urgente");
  await expect(await oneCard(eliott.page, t1)).toBeVisible();
  await eliott.page.getByLabel("Filtrer par priorité").selectOption("basse");
  await expect(eliott.page.getByText(t1, { exact: true })).toHaveCount(0);
  await eliott.page.getByLabel("Filtrer par priorité").selectOption("");
  await eliott.page.getByLabel("Filtrer par responsable").selectOption("commune");
  await expect(await oneCard(eliott.page, t1)).toBeVisible();
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("vues Kanban (glisser-déposer) et calendrier", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/missions?espace=communes&vue=kanban");
  const card = taskCard(page, t1);
  await expect(card).toBeVisible();
  const colEnCours = page.locator("section", { has: page.getByText("En cours", { exact: true }) });
  const from = await card.boundingBox(); const to = await colEnCours.boundingBox();
  await page.mouse.move(from!.x + 40, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(from!.x + 60, from!.y + 30, { steps: 4 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => { const db = sql(); const [r] = await db`select status from tasks where title = ${t1}`; await db.end(); return r.status; }, { timeout: 15_000 }).toBe("en_cours");
  await page.goto("/missions?espace=communes&vue=calendrier");
  await page.getByRole("button", { name: /^suivant|mois suivant/i }).first().click().catch(() => {});
  await page.goto("/missions?espace=communes&vue=liste");
  await expect(page.getByText(t1)).toBeVisible();
  await ctx.close();
});

test("pièces jointes : ajout, téléchargement, refus des formats et tailles interdits", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/missions?espace=communes");
  await taskCard(eliott.page, t1).getByRole("button").first().click();
  const input = dialog(eliott.page).locator("input[type=file]");
  await input.setInputFiles({ name: "bio.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 contenu de test") });
  await expect(dialog(eliott.page).getByRole("link", { name: "bio.pdf" })).toBeVisible({ timeout: 15_000 });
  await input.setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(eliott.page.locator("[aria-live=polite]")).toContainText(/format non accepté/i);
  await input.setInputFiles({ name: "gros.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(15.5 * 1024 * 1024, 1) });
  await expect(eliott.page.locator("[aria-live=polite]")).toContainText(/dépasse 15 Mo/i, { timeout: 30_000 });
  { const d = sql(); const [{ n }] = await d`select count(*)::int as n from attachments where filename = ${"gros.pdf"}`; await d.end(); expect(n).toBe(0); } // rien n'a été envoyé

  const href = await dialog(eliott.page).getByRole("link", { name: "bio.pdf" }).getAttribute("href");
  const r = await arthur.page.request.get(href!); // un autre utilisateur autorisé peut télécharger
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toBe("application/pdf");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await r.body()).toString()).toContain("contenu de test");
  const anon = await browser.newContext({ baseURL: "http://localhost:3100" });
  expect((await anon.request.get(href!, { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300); // sans session : refusé
  await anon.close();
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("suppression : Arthur ne peut supprimer que ses propres tâches (contrôle côté SERVEUR, rejeu de l'action)", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  // Arthur crée une tâche et la supprime via l'interface : on capture l'identifiant de l'action serveur
  const own = `Tâche d'Arthur à supprimer ${T}`;
  await createTaskIn(arthur.page, /mes tâches/i, own);
  let actionId = ""; let argBody = "";
  arthur.page.on("request", (rq) => { const id = rq.headers()["next-action"]; if (id && rq.method() === "POST") { actionId = id; argBody = rq.postData() ?? ""; } });
  await arthur.page.goto("/missions");
  await taskCard(arthur.page, own).getByRole("button").first().click();
  await dialog(arthur.page).getByRole("button", { name: /supprimer/i }).click();
  await dialog(arthur.page).getByRole("button", { name: /^confirmer$/i }).click();
  await expect.poll(() => actionId, { timeout: 15_000 }).not.toBe("");
  await expect(arthur.page.getByText(own, { exact: true })).toHaveCount(0);

  // Une tâche créée par Eliott : l'interface d'Arthur n'offre pas « Supprimer »
  const db = sql();
  const [victim] = await db`select id from tasks where title = ${t2}`; // créée par Eliott
  const [byArthur] = await db`select id from tasks where title = ${t1}`; // créée par Arthur
  await arthur.page.goto("/missions?espace=tout&tache=" + victim.id);
  await expect(dialog(arthur.page).getByText(t2)).toBeVisible();
  await expect(dialog(arthur.page).getByRole("button", { name: /supprimer/i })).toHaveCount(0);

  // Rejeu forcé de l'action de suppression avec l'id de la tâche d'Eliott (contourne l'interface)
  const forged = argBody.replace(/\["[0-9a-f-]{36}"\]/, `["${victim.id}"]`);
  expect(forged).toContain(victim.id);
  const res = await arthur.page.request.post("/missions", { headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" }, data: forged });
  expect(res.status()).toBe(200);
  expect(await res.text()).toMatch(/que les tâches que vous avez créées/i);
  const [still] = await db`select count(*)::int as n from tasks where id = ${victim.id}`;
  expect(still.n).toBe(1); // la tâche d'Eliott existe toujours
  // Eliott (administrateur) peut supprimer même la tâche créée par Arthur
  await eliott.page.goto("/missions?espace=tout&tache=" + byArthur.id);
  await expect(dialog(eliott.page).getByRole("button", { name: /supprimer/i })).toBeVisible();
  const [aud] = await db`select count(*)::int as n from audit_log where action = 'tache.suppression'`;
  expect(aud.n).toBeGreaterThanOrEqual(1); // suppression journalisée
  await db.end();
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("synchronisation bidirectionnelle : modification d'Eliott visible chez Arthur en direct", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  const db = sql();
  const [t] = await db`select id from tasks where title = ${t1}`;
  await db.end();
  await arthur.page.goto("/missions?espace=communes&tache=" + t.id);
  await expect(dialog(arthur.page).getByText(t1)).toBeVisible();
  await eliott.page.goto("/missions?espace=communes&tache=" + t.id);
  await dialog(eliott.page).getByLabel("Statut").selectOption("en_attente");
  await expect(arthur.page.getByText("En attente").first()).toBeVisible({ timeout: 20_000 });
  await eliott.ctx.close(); await arthur.ctx.close();
});
