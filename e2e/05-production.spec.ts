import { test, expect, Page } from "@playwright/test";
import { dialog, session, sql, submit, plusDays } from "./helpers";

test.describe.configure({ mode: "serial" });
const SHOOT = plusDays(13);
const q = async (text: string) => { const d = sql(); const r = await d.unsafe(text); await d.end(); return r; };
const one = async (text: string) => (await q(text))[0];
let epId = ""; let contactId = "";
const steps = (p: Page) => p.locator("ol");
async function validateStage(page: Page, label: RegExp) {
  await steps(page).getByRole("button", { name: label }).click();
  await dialog(page).getByRole("button", { name: /valider l.étape/i }).click();
}

test("confirmer un invité : épisode, tâches, checklist, autorisations, calendrier et fiche invité créés d'un coup", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/crm?categorie=a_contacter");
  await page.getByRole("button", { name: /ajouter un contact/i }).first().click();
  await dialog(page).getByLabel("Prénom").fill("Léa");
  await dialog(page).getByLabel("Nom", { exact: true }).fill("Martin");
  await dialog(page).getByLabel("Profession").fill("Productrice");
  await dialog(page).getByLabel("E-mail").fill("lea.martin@example.org");
  await submit(page, "[role=dialog] form button[type=submit]");
  await page.waitForURL(/\/crm\/[0-9a-f-]{36}/);
  contactId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: /confirmer l.invité/i }).click();
  await expect(dialog(page).getByText(/léa martin a dit oui/i)).toBeVisible();
  await dialog(page).locator("input[type=date]").fill(SHOOT);
  await dialog(page).getByLabel("Lieu de tournage").fill("Studio Paris 11e");
  await submit(page, "[role=dialog] form button[type=submit]");
  await page.waitForURL(/\/production\/[0-9a-f-]{36}/);
  epId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1, name: /léa martin/i })).toBeVisible();

  const ep = await one(`select stage, shoot_location, to_char(shoot_date at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI') as sd, contact_id from episodes where id = '${epId}'`);
  expect(ep.stage).toBe("confirme"); expect(ep.shoot_location).toBe("Studio Paris 11e"); expect(ep.sd).toBe(`${SHOOT} 10:00`); expect(ep.contact_id).toBe(contactId);
  expect((await one(`select category, response_received from contacts where id = '${contactId}'`)).category).toBe("invite_recu");
  const tasks = await q(`select title, due_date::text as d, automation_key from tasks where episode_id = '${epId}' order by due_date`);
  expect(tasks.length).toBe(4);
  expect(tasks.every((t) => t.automation_key?.startsWith(`ep:${epId}:`))).toBe(true);
  expect(tasks.map((t) => t.d)).toEqual([plusDays(-7, SHOOT), plusDays(-5, SHOOT), plusDays(-3, SHOOT), SHOOT]); // studio J-7, appel J-5, questions J-3, autorisations J
  const cl = await one(`select c.id, (select count(*)::int from checklist_items where checklist_id = c.id) as n from checklists c where episode_id = '${epId}' and phase = 'avant'`);
  expect(cl.n).toBe(10);
  expect((await q(`select kind, status from guest_documents where contact_id = '${contactId}'`)).map((r) => `${r.kind}:${r.status}`).sort()).toEqual(["autorisation_diffusion:manquant", "droit_image:manquant"]);
  const ev = await one(`select type, to_char(starts_at at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI') as s from events where episode_id = '${epId}'`);
  expect(ev.type).toBe("tournage"); expect(ev.s).toBe(`${SHOOT} 10:00`);
  await ctx.close();
});

test("Arthur est prévenu et voit l'épisode dans le Kanban à la bonne étape", async ({ browser }) => {
  const { ctx, page } = await session(browser, "arthur");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText(/léa martin a confirmé l.interview/i)).toBeVisible();
  await page.goto("/production");
  const col = page.locator("section", { has: page.getByText("4. Interview confirmée") });
  await expect(col.getByText("Léa Martin").first()).toBeVisible();
  await page.goto("/production?vue=tableau");
  await expect(page.getByRole("cell", { name: /léa martin/i }).first()).toBeVisible();
  await ctx.close();
});

test("aucun doublon : revalider une étape relance l'automatisation sans rien recréer", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/production/" + epId);
  await validateStage(page, /préparation de l.interview/i);
  await expect(page.getByText(/étape « préparation de l.interview » validée/i)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Parfait" }).click();
  expect((await one(`select count(*)::int as n from tasks where episode_id = '${epId}'`)).n).toBe(4);
  expect((await one(`select count(*)::int as n from events where episode_id = '${epId}'`)).n).toBe(1);
  expect((await one(`select count(*)::int as n from checklists where episode_id = '${epId}'`)).n).toBe(1);
  expect((await one(`select count(*)::int as n from guest_documents where contact_id = '${contactId}'`)).n).toBe(2);
  await ctx.close();
});

test("checklist : cocher, pourcentage d'avancement, ajouter un élément, qui a coché", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/production/" + epId);
  await arthur.page.goto("/production/" + epId);
  const cl = eliott.page.locator("#checklists");
  await expect(cl.getByText("0%")).toBeVisible();
  for (const l of ["Confirmer l'invité", "Préparer les questions", "Vérifier le studio"]) await cl.getByText(l, { exact: true }).click();
  await expect(cl.getByText("30%")).toBeVisible();
  await expect(arthur.page.locator("#checklists").getByText("30%")).toBeVisible({ timeout: 20_000 }); // synchronisé chez Arthur
  await cl.getByPlaceholder("Ajouter un élément…").fill("Préparer le plan B lumière");
  await cl.getByPlaceholder("Ajouter un élément…").press("Enter");
  await expect(cl.getByText("27%")).toBeVisible(); // 3 / 11
  const d = await q(`select count(*)::int as n, count(*) filter (where done_by is not null and done_at is not null)::int as tr from checklist_items i join checklists c on c.id = i.checklist_id where c.episode_id = '${epId}' and c.phase = 'avant' and done`);
  expect(d[0].n).toBe(3); expect(d[0].tr).toBe(3);
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("« À ne pas oublier » : tournage à venir, préparation incomplète, autorisations manquantes, tâches", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/a-ne-pas-oublier");
  await expect(page.getByText(/tournage — léa martin/i).first()).toBeVisible();
  await expect(page.getByText(/préparation — léa martin/i).first()).toBeVisible();
  await expect(page.getByText(/checklist avant tournage à 27 %/i).first()).toBeVisible(); // calcul exact
  await expect(page.getByText(/autorisation de droit à l.image — léa martin/i).first()).toBeVisible();
  await expect(page.getByText(/préparer les questions — léa martin/i).first()).toBeVisible();
  await page.getByText(/tournage — léa martin/i).first().click(); // lien direct vers l'élément
  await expect(page).toHaveURL(new RegExp(`/production/${epId}`));
  await ctx.close();
});

test("autorisations : jamais « reçu » ni « validé » sans preuve (base de données et interface)", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  // contraintes en base : impossible de contourner l'interface
  const d = sql();
  await expect(d.unsafe(`update guest_documents set status = 'valide' where contact_id = '${contactId}' and kind = 'droit_image'`)).rejects.toThrow(/guest_doc_proof_required|guest_doc_validation_trace/);
  await expect(d.unsafe(`update guest_documents set status = 'recu' where contact_id = '${contactId}' and kind = 'droit_image'`)).rejects.toThrow(/guest_doc_proof_required/);
  await d.end();

  await arthur.page.goto("/crm/autorisations");
  await expect(arthur.page.getByText(/manquants/i).first()).toBeVisible();
  const rowFor = (p: Page, t: string) => p.locator("div.rounded-xl.bg-night", { hasText: t }).last();
  await expect(rowFor(arthur.page, "Autorisation de droit à l'image")).toContainText(/non considéré comme signé/i);
  await expect(rowFor(arthur.page, "Autorisation de droit à l'image").getByRole("button", { name: "Valider" })).toHaveCount(0); // pas de « Valider » sans preuve
  await rowFor(arthur.page, "Autorisation de droit à l'image").locator("input[type=file]").setInputFiles({ name: "droit-image-lea.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 signé") });
  await expect(arthur.page.getByText(/preuve enregistrée/i)).toBeVisible();
  let r = await one(`select status, proof_attachment_id is not null as p from guest_documents where contact_id = '${contactId}' and kind = 'droit_image'`);
  expect(r.status).toBe("recu"); expect(r.p).toBe(true);

  await eliott.page.goto("/crm/autorisations");
  await expect(eliott.page.getByText("Reçus — à valider")).toBeVisible();
  await rowFor(eliott.page, "Autorisation de droit à l'image").getByRole("button", { name: "Valider" }).click();
  await expect(eliott.page.getByText(/document validé/i)).toBeVisible();
  r = await one(`select g.status, u.email as v, g.validated_at is not null as at from guest_documents g join users u on u.id = g.validated_by where g.contact_id = '${contactId}' and g.kind = 'droit_image'`);
  expect(r.status).toBe("valide"); expect(r.v).toBe("eliott@test.local"); expect(r.at).toBe(true);
  // l'autre document reste « manquant » et reste signalé
  await eliott.page.goto("/a-ne-pas-oublier");
  await expect(eliott.page.getByText(/autorisation de diffusion — léa martin/i).first()).toBeVisible();
  await expect(eliott.page.getByText(/autorisation de droit à l.image — léa martin/i)).toHaveCount(0); // validé : disparaît des rappels
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("tournage réalisé : montage, tâches, checklist « après », 8 déclinaisons, validation au calendrier — sans doublon", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/production/" + epId);
  await steps(page).getByRole("button", { name: /tournage réalisé/i }).click();
  await expect(dialog(page).getByText(/coupez/i)).toBeVisible();
  await expect(dialog(page).getByText(/déclinaisons de contenu/i)).toBeVisible(); // annonce de ce qui va se passer
  await dialog(page).getByRole("button", { name: /valider l.étape/i }).click();
  await expect(dialog(page).getByText(/compte-rendu des automatisations/i)).toBeVisible();
  await expect(dialog(page).getByText(/épisode passé en « montage en cours »/i)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Parfait" }).click();
  expect((await one(`select stage from episodes where id = '${epId}'`)).stage).toBe("montage");
  const t = await q(`select title from tasks where episode_id = '${epId}' and automation_key like '%:montage' or automation_key like '%:sauvegarde' or automation_key like '%:remerciement' or automation_key like '%:validation'`);
  expect(t.length).toBe(4);
  expect((await one(`select count(*)::int as n from tasks where episode_id = '${epId}'`)).n).toBe(8);
  expect((await one(`select count(*)::int as n from checklists where episode_id = '${epId}' and phase = 'apres'`)).n).toBe(1);
  const kinds = (await q(`select kind from contents where episode_id = '${epId}'`)).map((r) => r.kind).sort();
  expect(kinds).toEqual(["audio", "citation", "promo", "reel", "short", "teaser", "tiktok", "youtube_complet"]);
  expect((await one(`select count(*)::int as n from events where episode_id = '${epId}' and type = 'validation'`)).n).toBe(1);
  expect((await one(`select count(*)::int as n from episode_stages where episode_id = '${epId}'`)).n).toBe(7); // étapes 1 à 7 validées
  await ctx.close();
});

test("déclinaisons : statuts, « Publié » refusé sans lien de publication, avec lien accepté", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/production/" + epId);
  const sec = page.locator("#contenus");
  await expect(sec.getByText(/épisode complet youtube/i).first()).toBeVisible();
  const yt = sec.locator("tr", { hasText: /Épisode complet YouTube/ }).first();
  await yt.getByLabel("Statut").selectOption("publie");
  await expect(page.locator("[aria-live=polite]")).toContainText(/ajoutez d.abord le lien/i);
  expect((await one(`select status from contents where episode_id = '${epId}' and kind = 'youtube_complet'`)).status).toBe("a_produire");
  await yt.getByRole("button", { name: /épisode complet youtube/i }).click();
  await dialog(page).getByLabel("Lien vers la publication").fill("https://youtu.be/abc123");
  await dialog(page).getByLabel("Statut").selectOption("publie");
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect.poll(async () => (await one(`select status from contents where episode_id = '${epId}' and kind = 'youtube_complet'`)).status).toBe("publie");
  expect((await one(`select publication_links->>'youtube' as y from episodes where id = '${epId}'`)).y).toBe("https://youtu.be/abc123"); // reporté sur la fiche épisode
  await page.getByRole("link", { name: "Contenus", exact: true }).click();
  await expect(page).toHaveURL(/\/contenus/);
  await expect(page.getByText(/épisode complet youtube — léa martin/i).first()).toBeVisible();
  await ctx.close();
});

test("publication : fiche invité mise à jour, suivi des statistiques J+7 / J+30, promotion, étapes archivées", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/production/" + epId);
  await validateStage(page, /^\s*11\s*publication/i);
  await dialog(page).getByRole("button", { name: "Parfait" }).click();
  const e = await one(`select stage, published_at is not null as pub from episodes where id = '${epId}'`);
  expect(e.stage).toBe("publication"); expect(e.pub).toBe(true);
  const c = await one(`select publish_date::text as pd, episode_url from contacts where id = '${contactId}'`);
  expect(c.pd).toBe(plusDays(0)); expect(c.episode_url).toBe("https://youtu.be/abc123");
  const st = await q(`select due_date::text as d, automation_key from tasks where episode_id = '${epId}' and automation_key ~ ':(stats_j7|stats_j30|promo)$' order by due_date`);
  expect(st.map((x) => x.d)).toEqual([plusDays(3), plusDays(7), plusDays(30)]);
  expect((await one(`select count(*)::int as n from episode_stages where episode_id = '${epId}'`)).n).toBe(11);
  await page.goto("/crm/" + contactId);
  await expect(page.getByText("Invités reçus").first()).toBeVisible();
  await expect(page.getByText("https://youtu.be/abc123")).toBeVisible();
  await page.goto("/");
  const kpi = (l: string) => page.locator("a.card", { hasText: l });
  await expect(kpi("Épisodes disponibles")).toContainText("1");
  await expect(kpi("Invités reçus")).toContainText("1");
  await ctx.close();
});

test("production : filtres par étape / responsable et retour à l'étape précédente", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/production?vue=tableau");
  await page.getByLabel("Statut").selectOption("publication");
  await expect(page.getByRole("cell", { name: /léa martin/i }).first()).toBeVisible();
  await page.getByLabel("Statut").selectOption("montage");
  await expect(page.getByRole("cell", { name: /léa martin/i })).toHaveCount(0);
  await page.getByLabel("Statut").selectOption("");
  await page.getByLabel("Responsable").selectOption({ label: "Arthur Pomarede" });
  await expect(page.getByRole("cell", { name: /léa martin/i })).toHaveCount(0);
  await ctx.close();
});
