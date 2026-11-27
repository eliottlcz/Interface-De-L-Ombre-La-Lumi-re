import { test, expect, Page } from "@playwright/test";
import { dialog, session, sql, submit, plusDays, todayParis } from "./helpers";

test.describe.configure({ mode: "serial" });
const q = async (text: string) => { const d = sql(); const r = await d.unsafe(text); await d.end(); return r; };
const one = async (text: string) => (await q(text))[0];
const norm = (s: string) => s.replace(/[\s  ]/g, "");
let epId = ""; let contactId = ""; let eventId = "";

test("préparation : un invité et un épisode avec tournage (données réelles de test)", async () => {
  const [u] = await q(`select id from users where email = 'eliott@test.local'`);
  const [c] = await q(`insert into contacts (first_name, last_name, profession, category, owner_id) values ('Noé', 'Garcia', 'Cadreur', 'invite_recu', '${u.id}') returning id`);
  contactId = c.id;
  const [e] = await q(`insert into episodes (title, contact_id, stage, producer_id, shoot_date, shoot_location) values ('Noé Garcia', '${c.id}', 'confirme', '${u.id}', ('${plusDays(10)} 09:00+01')::timestamptz, 'Studio Lyon') returning id`);
  epId = e.id;
  await q(`insert into events (title, type, starts_at, episode_id, contact_id, automation_key) values ('Tournage — Noé Garcia', 'tournage', ('${plusDays(10)} 09:00+01')::timestamptz, '${e.id}', '${c.id}', 'ep:${e.id}:tournage')`);
  await q(`insert into contents (episode_id, kind, title, platform, status, planned_date) values ('${e.id}', 'reel', 'Reel — Noé Garcia', 'Instagram', 'a_produire', '${plusDays(5)}')`);
});

test("planifier un événement lié à un invité et un épisode, attribué à Arthur : Arthur est prévenu", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/calendrier");
  await eliott.page.getByRole("button", { name: /planifier/i }).first().click();
  const d = dialog(eliott.page);
  await d.getByLabel("Titre").fill("Appel de préparation — Noé");
  await d.getByLabel("Type").selectOption("interview");
  await d.getByLabel("Date", { exact: true }).fill(plusDays(2));
  await d.getByLabel("Début").fill("14:00");
  await d.getByLabel("Fin").fill("15:00");
  await d.getByLabel("Attribué à").selectOption({ label: "Arthur Pomarede" });
  await d.getByLabel("Invité").selectOption({ label: "Noé Garcia" });
  await d.getByLabel("Épisode").selectOption({ label: "Noé Garcia" });
  await submit(eliott.page, "[role=dialog] form button[type=submit]");
  await expect(dialog(eliott.page)).toHaveCount(0);
  const ev = await one(`select v.id, to_char(starts_at at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI') as s, to_char(ends_at at time zone 'Europe/Paris','HH24:MI') as e, a.email as who, episode_id, contact_id from events v join users a on a.id = v.assignee_id where v.title = 'Appel de préparation — Noé'`);
  eventId = ev.id;
  expect(ev.s).toBe(`${plusDays(2)} 14:00`); expect(ev.e).toBe("15:00"); expect(ev.who).toBe("arthur@test.local"); expect(ev.episode_id).toBe(epId); expect(ev.contact_id).toBe(contactId);
  await arthur.page.goto("/calendrier");
  await arthur.page.getByRole("button", { name: "Notifications" }).click();
  await expect(arthur.page.getByText(/a planifié : appel de préparation/i)).toBeVisible();
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("vues mois / semaine / jour, filtres par type et responsable", async ({ browser }) => {
  const { ctx, page } = await session(browser, "arthur");
  await page.goto("/calendrier?jour=" + plusDays(2));
  await expect(page.getByRole("button", { name: /appel de préparation — noé/i }).first()).toBeVisible();
  await page.goto("/calendrier?jour=" + plusDays(10)); // le mois où tombe le tournage
  await expect(page.getByRole("button", { name: /tournage — noé garcia/i }).first()).toBeVisible();
  await page.goto("/calendrier?jour=" + plusDays(5));
  await expect(page.getByRole("button", { name: /reel — noé garcia/i }).first()).toBeVisible(); // publication prévue issue des déclinaisons
  await page.goto("/calendrier?vue=semaine&jour=" + plusDays(2));
  await expect(page.getByText("Appel de préparation — Noé").first()).toBeVisible();
  await expect(page.getByText("14:00–15:00").first()).toBeVisible();
  await page.goto("/calendrier?vue=jour&jour=" + plusDays(2));
  await expect(page.getByText("Appel de préparation — Noé").first()).toBeVisible();
  await page.goto("/calendrier?vue=jour&jour=" + plusDays(3));
  await expect(page.getByText("Appel de préparation — Noé")).toHaveCount(0);
  await page.goto("/calendrier?jour=" + plusDays(2));
  await page.getByRole("button", { name: "Tournage", exact: true }).click(); // filtre par type
  await expect(page.getByRole("button", { name: /appel de préparation/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  await page.getByRole("button", { name: "Tournage", exact: true }).click();
  await expect(page.getByRole("button", { name: /appel de préparation/i }).first()).toBeVisible();
  await page.getByRole("button", { name: /tout afficher/i }).click();
  await page.getByLabel("Responsable").selectOption({ label: "Arthur Pomarede" });
  await expect(page.getByRole("button", { name: /appel de préparation/i }).first()).toBeVisible();
  await page.getByLabel("Responsable").selectOption({ label: "Eliott Le Clezio" });
  await expect(page.getByRole("button", { name: /appel de préparation/i })).toHaveCount(0); // attribué à Arthur
  await ctx.close();
});

async function dragChipToNeighbourDay(page: Page, title: RegExp, date: string) {
  const chip = page.getByRole("button", { name: title }).first();
  await chip.scrollIntoViewIfNeeded();
  const b = (await chip.boundingBox())!;
  const grid = (await page.locator("div.grid.grid-cols-7").nth(1).boundingBox())!;
  const dx = (grid.width / 7) * (new Date(date + "T12:00:00Z").getUTCDay() === 0 ? -1 : 1);
  await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 30, b.y + b.height / 2 + 4, { steps: 4 });
  await page.mouse.move(b.x + 20 + dx, b.y + b.height / 2, { steps: 14 });
  await page.mouse.up();
  return new Date(date + "T12:00:00Z").getUTCDay() === 0 ? -1 : 1;
}

test("glisser-déposer d'un événement : jour modifié, heure conservée, Arthur voit le changement", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/calendrier?jour=" + plusDays(2));
  await arthur.page.goto("/calendrier?jour=" + plusDays(2));
  const dir = await dragChipToNeighbourDay(eliott.page, /appel de préparation — noé/i, plusDays(2));
  await expect.poll(async () => (await one(`select to_char(starts_at at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI') as s from events where id = '${eventId}'`)).s, { timeout: 15_000 }).toBe(`${plusDays(2 + dir)} 14:00`);
  expect((await one(`select to_char(ends_at at time zone 'Europe/Paris','HH24:MI') as e from events where id = '${eventId}'`)).e).toBe("15:00");
  await arthur.page.goto("/calendrier?vue=jour&jour=" + plusDays(2 + dir));
  await expect(arthur.page.getByText("Appel de préparation — Noé").first()).toBeVisible();
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("déplacer le tournage au calendrier met à jour la fiche épisode ; déplacer une publication met à jour le contenu", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/calendrier?jour=" + plusDays(10));
  const dir = await dragChipToNeighbourDay(page, /tournage — noé garcia/i, plusDays(10));
  await expect.poll(async () => (await one(`select to_char(shoot_date at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI') as s from episodes where id = '${epId}'`)).s, { timeout: 15_000 }).toBe(`${plusDays(10 + dir)} 09:00`);
  await page.goto("/calendrier?jour=" + plusDays(5));
  const dir2 = await dragChipToNeighbourDay(page, /reel — noé garcia/i, plusDays(5));
  await expect.poll(async () => (await one(`select planned_date::text as d from contents where episode_id = '${epId}' and kind = 'reel'`)).d, { timeout: 15_000 }).toBe(plusDays(5 + dir2));
  await ctx.close();
});

test("modifier puis supprimer un événement (confirmation demandée, action journalisée)", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/calendrier?vue=semaine&jour=" + plusDays(2));
  await page.goto(`/calendrier?evenement=${eventId}&jour=${plusDays(1)}`);
  await expect(dialog(page).getByText("Appel de préparation — Noé")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Modifier" }).click();
  await dialog(page).getByLabel("Titre").fill("Appel de préparation (reporté) — Noé");
  await dialog(page).getByLabel("Lieu").fill("Visio");
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect.poll(async () => (await one(`select title from events where id = '${eventId}'`)).title).toBe("Appel de préparation (reporté) — Noé");
  await page.goto(`/calendrier?evenement=${eventId}`);
  await dialog(page).getByRole("button").filter({ has: page.locator("svg.lucide-trash-2") }).click();
  await expect(dialog(page).getByText(/supprimer cet événement/i)).toBeVisible(); // confirmation
  await dialog(page).getByRole("button", { name: /confirmer/i }).click();
  await expect.poll(async () => (await one(`select count(*)::int as n from events where id = '${eventId}'`)).n).toBe(0);
  expect((await one(`select count(*)::int as n from audit_log where action = 'evenement.suppression'`)).n).toBe(1);
  await ctx.close();
});

/* ───────────────────────────── FINANCES ───────────────────────────── */
const fin = (p: Page) => p.locator("main");
async function addTx(page: Page, kind: "Dépense" | "Recette", v: { montant: string; cat?: string; desc: string; ep?: string; statut?: string; echeance?: string }) {
  await page.goto("/finances");
  await page.getByRole("button", { name: kind, exact: true }).first().click();
  const d = dialog(page);
  await d.getByLabel(/montant/i).fill(v.montant);
  if (v.cat) await d.getByLabel("Catégorie").selectOption({ label: v.cat });
  await d.getByLabel("Description").fill(v.desc);
  if (v.ep) await d.getByLabel("Épisode associé").selectOption({ label: v.ep });
  if (v.statut) await d.getByLabel("Statut").selectOption(v.statut);
  if (v.echeance) await d.getByLabel("Échéance").fill(v.echeance);
  await submit(page, "[role=dialog] form button[type=submit]");
}

test("finances : dépenses, recette, totaux exacts, répartition par catégorie et par épisode", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await addTx(page, "Dépense", { montant: "1 234,00", cat: "Matériel", desc: "Micro cravate broadcast", ep: "Noé Garcia" });
  await expect(page.getByText("Opération ajoutée")).toBeVisible();
  await addTx(page, "Dépense", { montant: "89,90", cat: "Abonnements logiciels", desc: "Abonnement montage" });
  await addTx(page, "Recette", { montant: "500", cat: "Partenariat / sponsoring", desc: "Sponsoring studio" });
  const rows = await q(`select type, amount_cents::int as c, category from transactions order by amount_cents desc`);
  expect(rows.map((r) => `${r.type}:${r.c}:${r.category}`)).toEqual(["depense:123400:materiel", "recette:50000:sponsoring", "depense:8990:abonnement"]); // centimes exacts
  await page.goto("/finances");
  const kpi = async (l: string) => norm(await page.locator("div.card", { hasText: l }).first().innerText());
  expect(await kpi("Dépenses")).toContain("1324€"); // 1234 + 89,90 = 1323,90 arrondi à l'affichage
  expect(await kpi("Recettes")).toContain("500€");
  expect(await kpi("Solde")).toContain("824"); // 500 − 1323,90 = −823,90
  await expect(page.getByText("Micro cravate broadcast")).toBeVisible();
  expect(norm(await page.getByText("Micro cravate broadcast").locator("xpath=ancestor::button[1]").innerText())).toContain("−1234,00€".replace("−", "−")); // montant exact en liste
  await expect(page.getByText("Répartition des dépenses par catégorie")).toBeVisible();
  await expect(page.getByText("Dépenses par épisode")).toBeVisible();
  await expect(page.locator("figure", { hasText: "Dépenses par épisode" }).getByText("Noé Garcia")).toBeVisible();
  await ctx.close();
});

test("finances : montants invalides refusés, filtres, justificatif joint, Arthur n'y a pas accès", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.page.goto("/finances");
  for (const bad of ["0", "-5", "abc"]) {
    await eliott.page.getByRole("button", { name: "Dépense", exact: true }).first().click();
    await dialog(eliott.page).getByLabel(/montant/i).fill(bad);
    await dialog(eliott.page).getByLabel("Description").fill("Test " + bad);
    await submit(eliott.page, "[role=dialog] form button[type=submit]");
    await expect(eliott.page.locator("[aria-live=polite]")).toContainText(/montant/i);
    await dialog(eliott.page).getByRole("button", { name: "Annuler" }).click();
  }
  expect((await one(`select count(*)::int as n from transactions where description like 'Test %'`)).n).toBe(0);
  await eliott.page.getByLabel("Type").selectOption("recette");
  await expect(eliott.page.getByText("Sponsoring studio")).toBeVisible();
  await expect(eliott.page.getByText("Micro cravate broadcast")).toHaveCount(0);
  await eliott.page.getByLabel("Type").selectOption("");
  // justificatif
  await eliott.page.getByText("Micro cravate broadcast").click();
  await dialog(eliott.page).locator("input[type=file]").setInputFiles({ name: "facture-micro.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 facture") });
  const link = dialog(eliott.page).getByRole("link", { name: "facture-micro.pdf" });
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = (await link.getAttribute("href"))!;
  expect((await eliott.page.request.get(href)).status()).toBe(200);
  expect((await arthur.page.request.get(href)).status()).toBe(403); // justificatif financier : réservé
  await arthur.page.goto("/finances");
  await expect(arthur.page).toHaveURL(/refus/);
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("finances : échéance « à régler » → « À ne pas oublier » (Eliott seulement) ; export CSV/Excel aux formats français", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await addTx(eliott.page, "Dépense", { montant: "45,50", cat: "Frais de studio", desc: "Location studio Lyon", statut: "a_regler", echeance: plusDays(2) });
  await eliott.page.goto("/a-ne-pas-oublier");
  await expect(eliott.page.getByText("Location studio Lyon").first()).toBeVisible();
  await expect(eliott.page.getByText(/45,50.*à régler/i).first()).toBeVisible();
  await arthur.page.goto("/a-ne-pas-oublier");
  await expect(arthur.page.getByText("Location studio Lyon")).toHaveCount(0);
  const csv = await (await eliott.page.request.get("/api/export/finances?format=csv")).text();
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  expect(lines[0]).toBe("Date;Type;Montant (€);Montant signé (€);Catégorie;Description;Responsable;Épisode;Statut;Échéance;Justificatifs");
  const micro = lines.find((l) => l.includes("Micro cravate"))!;
  expect(micro).toContain(";1234;-1234;"); // entiers sans décimale
  expect(lines.find((l) => l.includes("Abonnement montage"))!).toContain(";89,90;-89,90;"); // virgule décimale (Excel FR)
  expect(micro.endsWith(";1")).toBe(true); // 1 justificatif
  expect(lines.find((l) => l.includes("Location studio"))!).toContain("À régler");
  const x = await eliott.page.request.get("/api/export/finances?format=xlsx");
  expect(x.headers()["content-disposition"]).toMatch(/dlal-finances-\d{4}-\d{2}-\d{2}\.xlsx/);
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("finances : suppression avec confirmation, journalisée comme action sensible", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/finances");
  await page.getByText("Location studio Lyon").click();
  await dialog(page).getByRole("button").filter({ has: page.locator("svg.lucide-trash-2") }).first().click();
  await expect(dialog(page).getByText(/supprimer définitivement cette opération/i)).toBeVisible();
  await dialog(page).getByRole("button", { name: /confirmer/i }).click();
  await expect.poll(async () => (await one(`select count(*)::int as n from transactions where description = 'Location studio Lyon'`)).n).toBe(0);
  const a = await one(`select sensitive, metadata->>'amountCents' as m from audit_log where action = 'finance.suppression'`);
  expect(a.sensitive).toBe(true); expect(a.m).toBe("4550");
  await ctx.close();
});

test("recherche globale : résultats par catégorie, finances masquées à Arthur, navigation au clavier", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  for (const [who, finances] of [[eliott, true], [arthur, false]] as const) {
    await who.page.goto("/");
    await who.page.keyboard.press("Control+k");
    await who.page.getByPlaceholder(/invités, épisodes/i).fill("Garcia");
    const dlg = who.page.locator("div.fixed").filter({ has: who.page.getByPlaceholder(/invités, épisodes/i) });
    await expect(dlg.getByText("Invités & contacts")).toBeVisible();
    await expect(dlg.getByText("Épisodes", { exact: true })).toBeVisible();
    await expect(dlg.getByText("Noé Garcia").first()).toBeVisible();
    await who.page.getByPlaceholder(/invités, épisodes/i).fill("micro cravate");
    if (finances) await expect(dlg.getByText("Dépenses & recettes")).toBeVisible(); else { await expect(dlg.getByText("Aucun résultat")).toBeVisible(); }
  }
  await eliott.page.getByPlaceholder(/invités, épisodes/i).fill("Noé");
  await eliott.page.waitForTimeout(600);
  await eliott.page.keyboard.press("Enter"); // ouvre le premier résultat
  await expect(eliott.page).toHaveURL(/\/crm\/|\/production\//);
  await eliott.ctx.close(); await arthur.ctx.close();
});
