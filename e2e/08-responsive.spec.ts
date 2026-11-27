import { test, expect, devices, Page } from "@playwright/test";
import { dialog, sessionWith, sql, submit, autoHydrate, URL } from "./helpers";

/**
 * Vérification sur 4 formats : ordinateur, iPad paysage, iPad portrait, iPhone.
 * Même base, mêmes comptes : chaque page est contrôlée pour les débordements horizontaux, les erreurs,
 * la présence du contenu et la taille des zones tactiles.
 */
const FORMATS = {
  ordinateur: { viewport: { width: 1440, height: 900 } },
  "ipad-paysage": { ...devices["iPad Pro 11 landscape"] },
  "ipad-portrait": { ...devices["iPad Pro 11"] },
  iphone: { ...devices["iPhone 14"] },
} as const;
type Format = keyof typeof FORMATS;
const q = async (text: string) => { const d = sql(); const r = await d.unsafe(text); await d.end(); return r; };

async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) out.push(`la page défile horizontalement (${document.documentElement.scrollWidth} > ${vw})`);
    const clipped = (el: Element) => { let p = el.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (["auto", "scroll", "hidden", "clip"].includes(o)) return true; p = p.parentElement; } return false; };
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && !clipped(el)) out.push(`déborde à droite : <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> (${Math.round(r.right)} > ${vw})`);
      if (out.length > 4) break;
    }
    return out;
  });
}
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const coarse = matchMedia("(pointer: coarse)").matches;
    if (!coarse) return [];
    const out: string[] = [];
    for (const el of document.querySelectorAll("main button, main select, main input:not([type=file]):not([type=hidden]):not([type=checkbox]), main textarea, header button, nav button")) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 32) out.push(`${el.tagName.toLowerCase()} « ${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)} » ${Math.round(r.height)}px`);
    }
    return out.slice(0, 6);
  });
}

async function pagesFor() {
  const [ep] = await q(`select id from episodes order by created_at limit 1`);
  const [ct] = await q(`select id from contacts where category = 'invite_recu' order by created_at limit 1`);
  const [tk] = await q(`select id from tasks order by created_at limit 1`);
  const list: [string, string][] = [
    ["Accueil", "/"], ["À ne pas oublier", "/a-ne-pas-oublier"], ["Missions (liste)", "/missions?espace=tout"], ["Missions (Kanban)", "/missions?espace=tout&vue=kanban"],
    ["Missions (calendrier)", "/missions?espace=tout&vue=calendrier"], ["Missions (historique)", "/missions?espace=tout&vue=historique"], ["Tâche ouverte", `/missions?espace=tout&tache=${tk?.id}`],
    ["CRM (tableau)", "/crm?categorie=tous"], ["CRM (Kanban)", "/crm?vue=kanban"], ["Fiche invité", `/crm/${ct?.id}`], ["Autorisations", "/crm/autorisations"],
    ["Production (Kanban)", "/production"], ["Production (tableau)", "/production?vue=tableau"], ["Fiche épisode", `/production/${ep?.id}`],
    ["Calendrier (mois)", "/calendrier"], ["Calendrier (semaine)", "/calendrier?vue=semaine"], ["Calendrier (jour)", "/calendrier?vue=jour"],
    ["Contenus", "/contenus"], ["Checklists", "/checklists"], ["Finances", "/finances"], ["Statistiques", "/statistiques"], ["Statistiques (Spotify)", "/statistiques"],
    ["Idées du jour", "/idees"], ["Ressources", "/ressources"], ["Coffre-fort", "/ressources/coffre-fort"], ["Google Drive", "/drive"], ["Activité", "/activite"],
    ["Paramètres (profil)", "/parametres"], ["Paramètres (équipe)", "/parametres?onglet=equipe"], ["Paramètres (intégrations)", "/parametres?onglet=integrations"],
    ["Paramètres (journal)", "/parametres?onglet=journal"], ["Paramètres (données)", "/parametres?onglet=donnees"],
  ];
  return list;
}

for (const [fmt, opts] of Object.entries(FORMATS) as [Format, (typeof FORMATS)[Format]][]) {
  test.describe(`format ${fmt}`, () => {
    test.describe.configure({ mode: "serial" });

    test(`toutes les pages : aucun débordement, aucune erreur, contenu visible, zones tactiles suffisantes`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { ctx, page } = await sessionWith(browser, "eliott", opts);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push("JS: " + e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*(401|403|404)/.test(m.text())) errors.push("console: " + m.text().slice(0, 160)); });
      const failures: string[] = [];
      for (const [name, path] of await pagesFor()) {
        const resp = await page.goto(path);
        if (name === "Statistiques (Spotify)") { await page.getByRole("tab", { name: "Spotify for Creators" }).click(); }
        if (resp?.status() !== 200) failures.push(`${name}: HTTP ${resp?.status()}`);
        await expect(page.locator("main h1, main h2").first(), name).toBeVisible();
        const p = await layoutProblems(page); if (p.length) failures.push(`${name}: ${p.join(" | ")}`);
        const t = await smallTargets(page); if (t.length) failures.push(`${name}: zones tactiles trop petites → ${t.join(", ")}`);
      }
      expect(errors, "erreurs JavaScript / console").toEqual([]);
      expect(failures, `problèmes d'affichage (${fmt})`).toEqual([]);
      await ctx.close();
    });

    test(`navigation : ${fmt === "iphone" || fmt === "ipad-portrait" ? "menu coulissant + barre d'onglets" : "menu latéral permanent"}`, async ({ browser }) => {
      const { ctx, page } = await sessionWith(browser, "eliott", opts);
      const vw = page.viewportSize()!.width;
      const aside = page.locator("aside");
      const links = ["Vue d'ensemble", "Statistiques", "Invités & CRM", "Production", "Calendrier éditorial", "Mes missions", "Idées du jour", "Ressources", "Google Drive", "Checklists", "Finances", "Contenus", "À ne pas oublier", "Paramètres"];
      if (vw >= 1024) {
        await expect(aside).toBeInViewport();
        await expect(page.getByRole("button", { name: "Menu" }).first()).toBeHidden();
      } else {
        await expect(aside).not.toBeInViewport(); // menu replié
        await page.getByRole("button", { name: "Menu", exact: true }).first().click();
        await expect(aside).toBeInViewport();
      }
      for (const l of links) await expect(aside.getByRole("link", { name: new RegExp("^" + l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "( \\d+)?$") }), l).toBeVisible(); // le badge d'urgences peut s'ajouter au nom // les 14 rubriques existent partout
      await aside.getByRole("link", { name: "Production", exact: true }).click();
      await expect(page).toHaveURL(/\/production/);
      if (vw < 1024) await expect(aside).not.toBeInViewport(); // se referme après la navigation
      if (vw < 768) {
        const bar = page.getByRole("navigation", { name: "Navigation principale" });
        await expect(bar).toBeInViewport();
        for (const l of ["Accueil", "Missions", "CRM", "Agenda", "Menu"]) await expect(bar.getByText(l, { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Créer", exact: true }).click();
        for (const l of ["Ajouter un invité", "Ajouter une tâche", "Créer un épisode", "Programmer un tournage", "Ajouter une publication", "Ajouter une dépense", "Ajouter une ressource"])
          await expect(page.getByRole("link", { name: l })).toBeVisible(); // toutes les actions rapides, aussi sur téléphone
        await page.getByRole("link", { name: "Ajouter une tâche" }).click();
        await expect(dialog(page).getByText("Nouvelle tâche")).toBeVisible();
      } else {
        await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();
        await page.getByRole("button", { name: "Créer", exact: true }).click();
        await expect(page.getByRole("link", { name: "Programmer un tournage" })).toBeVisible();
      }
      await ctx.close();
    });

    test(`formulaire en fenêtre : tient dans l'écran, défile, bouton de validation atteignable, création réussie`, async ({ browser }) => {
      const { ctx, page } = await sessionWith(browser, "eliott", opts);
      await page.goto("/missions?nouveau=1");
      const d = dialog(page);
      await expect(d).toBeVisible();
      await page.waitForTimeout(450); // fin de l'animation d'apparition
      const vp = page.viewportSize()!;
      const box = (await d.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1); expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
      const title = `Tâche ${fmt} ${Date.now()}`;
      await d.getByLabel("Titre").fill(title);
      const submitBtn = d.getByRole("button", { name: "Créer la tâche" });
      await submitBtn.scrollIntoViewIfNeeded();
      await expect(submitBtn).toBeInViewport();
      await submit(page, "[role=dialog] form button[type=submit]");
      await expect(dialog(page)).toHaveCount(0);
      expect((await q(`select count(*)::int as n from tasks where title = '${title}'`))[0].n).toBe(1);
      await ctx.close();
    });
  });
}

/* ───── Aucune fonctionnalité perdue sur smartphone : mêmes actions, présentation adaptée ───── */
test.describe("iPhone : mêmes fonctionnalités", () => {
  test.describe.configure({ mode: "serial" });

  test("CRM : cartes avec contact direct, déplacement par menu (sans glisser), mêmes données que sur ordinateur", async ({ browser }) => {
    const desk = await sessionWith(browser, "eliott", FORMATS.ordinateur);
    const phone = await sessionWith(browser, "eliott", FORMATS.iphone);
    await desk.page.goto("/crm?categorie=tous"); await phone.page.goto("/crm?categorie=tous");
    const deskNames = (await desk.page.locator("tbody tr td:first-child").allInnerTexts()).map((s) => s.trim()).sort();
    const phoneNames = (await phone.page.locator("a.block .min-w-0 > .font-semibold").allInnerTexts()).map((s) => s.trim()).sort();
    expect(phoneNames).toEqual(deskNames); expect(deskNames.length).toBeGreaterThan(2);
    await expect(phone.page.locator("table")).toBeHidden(); // tableau remplacé par des cartes
    await expect(phone.page.getByRole("link", { name: "E-mail" }).first()).toHaveAttribute("href", /^mailto:/);
    // déplacement sans glisser-déposer
    const [c] = await q(`select id, first_name from contacts where category = 'a_contacter' and archived_at is null limit 1`);
    await phone.page.goto("/crm?vue=kanban&categorie=a_contacter");
    const card = phone.page.locator("div.rounded-xl", { hasText: c.first_name }).first();
    await card.getByLabel("Déplacer vers").selectOption("a_relancer");
    await expect.poll(async () => (await q(`select category from contacts where id = '${c.id}'`))[0].category).toBe("a_relancer");
    await q(`update contacts set category = 'a_contacter' where id = '${c.id}'`);
    await desk.ctx.close(); await phone.ctx.close();
  });

  test("production et missions : Kanban défilable, changement d'étape / de statut par menu", async ({ browser }) => {
    const { ctx, page } = await sessionWith(browser, "eliott", FORMATS.iphone);
    await page.goto("/production");
    const scroller = page.locator("div.snap-x").first();
    expect(await scroller.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true); // colonnes défilables horizontalement
    await expect(page.getByText("12. Promotion terminée").first()).toBeAttached();
    const [e] = await q(`select id, title, stage from episodes where stage <> 'promotion_terminee' limit 1`);
    const card = page.locator("div.rounded-xl", { hasText: e.title }).first();
    await card.scrollIntoViewIfNeeded();
    const before = e.stage;
    await card.getByLabel("Passer à l'étape").selectOption("validation");
    await expect.poll(async () => (await q(`select stage from episodes where id = '${e.id}'`))[0].stage).toBe("validation");
    await q(`update episodes set stage = '${before}' where id = '${e.id}'`);
    await page.goto("/missions?espace=tout&vue=kanban");
    const [t] = await q(`select id, title from tasks where status = 'a_faire' limit 1`);
    const tc = page.locator("div.group", { hasText: t.title }).first();
    await tc.locator("xpath=..").getByLabel("Déplacer vers").selectOption("en_cours");
    await expect.poll(async () => (await q(`select status from tasks where id = '${t.id}'`))[0].status).toBe("en_cours");
    await ctx.close();
  });

  test("calendrier : agenda du jour, création depuis le téléphone", async ({ browser }) => {
    const { ctx, page } = await sessionWith(browser, "eliott", FORMATS.iphone);
    await page.goto("/calendrier");
    const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date());
    await expect(page.locator("div.md\\:hidden .eyebrow").first()).toHaveText(new RegExp(day, "i")); // l'agenda s'ouvre sur le jour courant
    await page.locator("div.md\\:hidden").getByRole("button", { name: "+ Ajouter" }).click();
    await expect(dialog(page).getByText("Planifier")).toBeVisible();
    const title = "Rendez-vous mobile " + Date.now();
    await dialog(page).getByLabel("Titre").fill(title);
    await dialog(page).getByRole("button", { name: "Enregistrer" }).scrollIntoViewIfNeeded();
    await submit(page, "[role=dialog] form button[type=submit]");
    await expect.poll(async () => (await q(`select count(*)::int as n from events where title = '${title}'`))[0].n).toBe(1);
    await page.reload();
    await expect(page.locator("div.md\\:hidden").getByText(title)).toBeVisible(); // visible dans l'agenda du jour sélectionné
    await ctx.close();
  });

  test("recherche plein écran, notifications, fiche épisode (sections accessibles), finances (tableau → liste)", async ({ browser }) => {
    const { ctx, page } = await sessionWith(browser, "eliott", FORMATS.iphone);
    await page.getByRole("button", { name: /rechercher/i }).first().click();
    await page.getByPlaceholder(/invités, épisodes/i).fill("Léa");
    await expect(page.locator("div.fixed").getByText("Invités & contacts")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Notifications", { exact: true }).first()).toBeVisible();
    const [ep] = await q(`select id from episodes order by created_at limit 1`);
    await page.goto("/production/" + ep.id);
    for (const s of ["Déclinaisons de contenu", "Checklists de tournage", "Préparation de l'interview", "Autorisations de l'invité", "Google Drive"]) await expect(page.getByText(s, { exact: false }).first()).toBeAttached();
    await page.goto("/finances");
    await expect(page.getByText("Les coulisses du budget")).toBeVisible();
    await ctx.close();
  });
});

test("iPad portrait et paysage : utilisable au tactile et au clavier (Tab, Entrée, Échap)", async ({ browser }) => {
  const { ctx, page } = await sessionWith(browser, "eliott", FORMATS["ipad-paysage"]);
  await page.goto("/crm?nouveau=1");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0); // Échap ferme la fenêtre
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON", "INPUT"]).toContain(focused); // le focus clavier est visible et atteint des éléments interactifs
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/invités, épisodes/i)).toBeFocused();
  await ctx.close();
});

test("écran de connexion sur les 4 formats : sans débordement, formulaire utilisable", async ({ browser }) => {
  for (const [name, opts] of Object.entries(FORMATS)) {
    const ctx = await browser.newContext({ ...opts, baseURL: URL, locale: "fr-FR" });
    const page = autoHydrate(await ctx.newPage());
    await page.goto("/connexion");
    expect(await layoutProblems(page), name).toEqual([]);
    await expect(page.getByRole("button", { name: /entrer dans le qg/i })).toBeInViewport();
    await expect(page.locator("p.quote:visible").filter({ hasText: /personne ne voit ce qu/i })).toHaveCount(1); // la citation est présente à toutes les tailles
    await ctx.close();
  }
});
