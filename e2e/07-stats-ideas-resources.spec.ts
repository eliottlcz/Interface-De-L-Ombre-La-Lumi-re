import { test, expect } from "@playwright/test";
import { dialog, session, sql, submit, plusDays, todayParis, URL } from "./helpers";

test.describe.configure({ mode: "serial" });
const q = async (text: string) => { const d = sql(); const r = await d.unsafe(text); await d.end(); return r; };
const one = async (text: string) => (await q(text))[0];
const norm = (s: string) => s.replace(/[\s  ]/g, "");

test("statistiques vides : aucune valeur inventée, état de chaque connecteur explicite", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/statistiques");
  for (const p of ["YouTube", "Instagram", "TikTok"]) {
    const card = page.locator("div.card", { hasText: new RegExp("^\\s*" + p) }).first();
    await expect(card.getByText("Non configuré")).toBeVisible();
  }
  await expect(page.getByText(/GOOGLE_CLIENT_ID/)).toBeVisible();   // dit précisément ce qui manque
  await expect(page.getByText(/META_APP_ID/)).toBeVisible();
  await expect(page.getByText(/TIKTOK_CLIENT_KEY/)).toBeVisible();
  for (const p of ["Spotify for Creators", "Apple Podcasts", "Deezer"]) await expect(page.locator("div.card", { hasText: p }).first().getByText("Saisie manuelle")).toBeVisible();
  // aucun bouton « Connecter » / « Synchroniser » tant que l'application n'est pas configurée
  await expect(page.getByRole("link", { name: "Connecter" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Synchroniser" })).toHaveCount(0);
  const nums = await page.locator("div.display").allInnerTexts();
  expect(nums.join("")).not.toMatch(/\d/); // aucun chiffre affiché : uniquement des « — »
  await page.getByRole("tab", { name: "YouTube" }).click();
  await expect(page.getByText(/donnée indisponible — compte non connecté/i).first()).toBeVisible();
  await page.goto("/");
  await expect(page.locator("a.card", { hasText: "Abonnés (toutes plateformes)" })).toContainText("—");
  await expect(page.locator("a.card", { hasText: "Vues cumulées" })).toContainText("Aucune donnée");
  await ctx.close();
});

test("OAuth : démarrage refusé si non configuré, retour avec état invalide rejeté", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  const r = await page.request.get("/api/integrations/connect/youtube", { maxRedirects: 0 });
  expect(r.status()).toBe(307); expect(r.headers()["location"]).toContain("youtube_non_configure");
  const r2 = await page.request.get("/api/integrations/callback/youtube?state=falsifie&code=x", { maxRedirects: 0 });
  expect(r2.headers()["location"]).toContain("etat_invalide");
  const anon = await browser.newContext({ baseURL: URL });
  const r3 = await anon.request.get("/api/integrations/callback/youtube?state=a&code=b", { maxRedirects: 0 });
  expect(r3.headers()["location"]).toMatch(/connexion/);
  await anon.close();
  await page.goto("/parametres?onglet=integrations");
  await expect(page.getByText("Google Drive").first()).toBeVisible();
  await expect(page.getByText(/GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET/).first()).toBeVisible();
  await expect(page.getByText(/ANTHROPIC_API_KEY absente/)).toBeVisible();
  await ctx.close();
});

test("saisie manuelle : identifiée comme telle, additionnée sur l'accueil, évolution sur la période", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur"); // Arthur a le droit de saisir
  const enter = async (page: typeof eliott.page, tab: string, date: string, vals: Record<string, string>) => {
    await page.goto("/statistiques");
    await page.getByRole("tab", { name: tab }).click();
    await page.getByRole("button", { name: "Saisir" }).first().click();
    await dialog(page).getByLabel("Date de la mesure").fill(date);
    for (const [l, v] of Object.entries(vals)) await dialog(page).getByLabel(l, { exact: true }).fill(v);
    await dialog(page).getByLabel("Source / remarque").fill("Relevé de test");
    await submit(page, "[role=dialog] form button[type=submit]");
    await expect(page.getByText(/valeur\(s\) enregistrée\(s\) \(saisie manuelle\)/)).toBeVisible();
  };
  await enter(eliott.page, "Spotify for Creators", plusDays(-40), { "Abonnés (followers)": "100" });
  await enter(eliott.page, "Spotify for Creators", plusDays(-2), { "Abonnés (followers)": "120", "Streams": "3 400" });
  await enter(arthur.page, "Instagram", plusDays(-2), { "Abonnés": "800", "Vues": "15000" });
  await enter(eliott.page, "TikTok", plusDays(-1), { "Abonnés": "200" });
  const rows = await q(`select platform, metric, value::float as v, source from metric_snapshots order by platform, metric, day`);
  expect(rows.every((r) => r.source === "manuel")).toBe(true);
  expect(rows.find((r) => r.platform === "spotify" && r.metric === "streams")!.v).toBe(3400); // « 3 400 » correctement lu
  await eliott.page.goto("/statistiques");
  await eliott.page.getByRole("tab", { name: "Spotify for Creators" }).click();
  const card = eliott.page.locator("div.card", { hasText: "Abonnés (followers)" }).first();
  await expect(card.getByText("Saisie manuelle")).toBeVisible();
  await expect(card).toContainText("120");
  await expect(card).toContainText(/\+20 depuis le/); // 120 − 100, avec la date de la mesure de référence
  await expect(eliott.page.locator("div.card", { hasText: "Streams" }).first()).toContainText("3 400");
  await eliott.page.goto("/");
  const abonnes = norm(await eliott.page.locator("a.card", { hasText: "Abonnés (toutes plateformes)" }).innerText());
  expect(abonnes).toContain("1120"); // 120 + 800 + 200 : somme exacte des dernières valeurs
  expect(norm(await eliott.page.locator("a.card", { hasText: "Vues cumulées" }).innerText())).toMatch(/15[kK]/); // notation compacte au-delà de 10 000
  await expect(eliott.page.locator("a.card", { hasText: "Abonnés (toutes plateformes)" })).toContainText(/spotify|instagram|tiktok/i);
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("périodes 7 j / 30 j / 90 j / 12 mois / personnalisée ; import d'une série collée ; comparaison entre plateformes", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/statistiques?periode=7j");
  await page.getByRole("tab", { name: "Spotify for Creators" }).click();
  const ref = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(plusDays(-40) + "T12:00:00Z"));
  await expect(page.locator("div.card", { hasText: "Abonnés (followers)" }).first()).toContainText(`+20 depuis le ${ref}`); // la référence (40 j) est annoncée, pas déguisée en « 7 jours »
  await page.goto("/statistiques?periode=90j");
  await page.getByRole("tab", { name: "Spotify for Creators" }).click();
  await expect(page.locator("div.card", { hasText: "Abonnés (followers)" }).first()).toContainText("120");
  await page.goto("/statistiques?periode=12m");
  await expect(page.getByRole("button", { name: "12 mois" })).toHaveCSS("background-color", /245, 244, 240/);
  await page.getByRole("button", { name: "Période", exact: true }).click();
  await page.getByLabel("Du", { exact: true }).fill(plusDays(-10));
  await page.getByLabel("Au", { exact: true }).fill(todayParis());
  await page.getByRole("button", { name: "Appliquer" }).click();
  await expect(page).toHaveURL(/periode=perso/);
  // import collé (formats ISO et JJ/MM/AAAA, en-tête ignoré)
  await page.getByRole("tab", { name: "Apple Podcasts" }).click();
  await page.getByRole("button", { name: "Importer" }).first().click();
  const [y, m, d] = plusDays(-3).split("-");
  await dialog(page).getByLabel("Données").fill(`date;ecoutes\n${plusDays(-5)};410\n${d}/${m}/${y};455\nligne;invalide`);
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.getByText(/2 ligne\(s\) importée\(s\)/)).toBeVisible();
  expect(await q(`select day::text as d, value::float as v from metric_snapshots where platform = 'apple' order by day`)).toEqual([{ d: plusDays(-5), v: 410 }, { d: plusDays(-3), v: 455 }]);
  await page.getByRole("tab", { name: "Vue d'ensemble" }).click();
  await expect(page.getByText("Comparaison des communautés (abonnés)")).toBeVisible();
  const fig = page.locator("figure", { hasText: "Comparaison des communautés" });
  await expect(fig.getByText("Instagram")).toBeVisible(); await expect(fig.getByText("TikTok")).toBeVisible(); await expect(fig.getByText("Spotify for Creators")).toBeVisible();
  await ctx.close();
});

test("saisie manuelle : valeurs négatives ou non numériques refusées ; suppression d'une saisie", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/statistiques");
  await page.getByRole("tab", { name: "Deezer" }).click();
  await page.getByRole("button", { name: "Saisir" }).first().click();
  await dialog(page).getByLabel("Écoutes", { exact: true }).fill("-4");
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.locator("[aria-live=polite]")).toContainText(/valeur invalide/i);
  await dialog(page).getByLabel("Écoutes", { exact: true }).fill("abc");
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.locator("[aria-live=polite]")).toContainText(/valeur invalide/i);
  await dialog(page).getByLabel("Écoutes", { exact: true }).fill("77");
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect.poll(async () => (await one(`select count(*)::int as n from metric_snapshots where platform = 'deezer'`)).n).toBe(1);
  await page.reload();
  await page.getByRole("tab", { name: "Deezer" }).click();
  await page.getByRole("button", { name: "Supprimer" }).first().click();
  await expect.poll(async () => (await one(`select count(*)::int as n from metric_snapshots where platform = 'deezer'`)).n).toBe(0);
  await ctx.close();
});

/* ───────────── Idées du jour : jamais de génération simulée ───────────── */
test("idées du jour sans clé d'IA : « configuration manquante », rien n'est généré ni simulé", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/idees");
  await expect(page.getByText("Configuration manquante")).toBeVisible();
  await expect(page.getByText(/ANTHROPIC_API_KEY/)).toBeVisible();
  await expect(page.getByRole("button", { name: /générer/i })).toHaveCount(0);
  await expect(page.getByText(/pas encore d.idées aujourd.hui/i)).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(/en attente de configuration/i)).toBeVisible();
  expect((await one(`select count(*)::int as n from ideas`)).n).toBe(0);
  await ctx.close();
});

test("tâche quotidienne : rappels d'échéance et de relance sans doublon, idées « non configuré », statistiques non connectées", async ({ browser, request }) => {
  const [a] = await q(`select id from users where email = 'arthur@test.local'`);
  const [e] = await q(`select id from users where email = 'eliott@test.local'`);
  const [t] = await q(`insert into tasks (title, assignee_id, due_date, created_by) values ('Rendre le sous-titrage', '${a.id}', '${plusDays(-1)}', '${e.id}') returning id`);
  const [c] = await q(`insert into contacts (first_name, last_name, category, owner_id, next_followup_at) values ('Sam', 'Relance', 'mail_envoye', '${a.id}', '${todayParis()}') returning id`);
  const run = async () => (await request.get("/api/cron/quotidien", { headers: { authorization: "Bearer verif-cron-secret-0123456789" } })).json();
  const r1 = await run();
  expect(r1.ok).toBe(true);
  expect(r1.report.idees.status).toBe("non_configure");
  expect(r1.report.synchronisation).toEqual({ youtube: "non connecté", instagram: "non connecté", tiktok: "non connecté" });
  const n1 = await q(`select title from notifications where user_id = '${a.id}' and type in ('echeance','relance')`);
  expect(n1.map((x) => x.title).sort()).toEqual(["En retard : Rendre le sous-titrage", "Relance du jour : Sam Relance"]);
  await run(); // deuxième passage le même jour
  expect((await one(`select count(*)::int as n from notifications where user_id = '${a.id}' and type in ('echeance','relance')`)).n).toBe(2); // pas de doublon
  const { ctx, page } = await session(browser, "arthur");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("En retard : Rendre le sous-titrage")).toBeVisible();
  await page.getByText("En retard : Rendre le sous-titrage").click();
  await expect(page).toHaveURL(new RegExp(`/missions\\?tache=${t.id}`));
  await expect(page.getByRole("button", { name: "Notifications" })).not.toContainText("2"); // lues au clic
  await ctx.close();
  void c;
});

test("idées : favori, ignorer, transformer en tâche (données d'exemple d'un test, pas de génération)", async ({ browser }) => {
  const today = todayParis();
  await q(`insert into ideas (day, title, category, description, relevance, interest, actions, sources, model) values
    ('${today}', 'Portrait d''une cheffe de plateau', 'Invité inattendu', 'Description de test A', 'Pertinence A', 'Intérêt A', '["Contacter la production"]', '[{"title":"Source A","url":"https://example.org/a"}]', 'fixture-de-test'),
    ('${today}', 'Format « La journée type »', 'Format vidéo', 'Description de test B', 'Pertinence B', 'Intérêt B', '["Tester sur un épisode"]', '[]', 'fixture-de-test')`);
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/idees");
  await expect(page.getByText("Idée 01")).toBeVisible(); await expect(page.getByText("Idée 02")).toBeVisible();
  await expect(page.getByRole("link", { name: "Source A" })).toHaveAttribute("href", "https://example.org/a");
  const a = page.locator("article", { hasText: "Portrait d'une cheffe" });
  await a.getByRole("button", { name: "Favori", exact: true }).click();
  await expect.poll(async () => (await one(`select status from ideas where title like 'Portrait%'`)).status).toBe("favori");
  await page.getByRole("tab", { name: /favoris/i }).click();
  await expect(page.getByText("Portrait d'une cheffe de plateau")).toBeVisible();
  await page.getByRole("tab", { name: /aujourd.hui/i }).click();
  await page.locator("article", { hasText: "La journée type" }).getByRole("button", { name: "Ignorer" }).click();
  await expect.poll(async () => (await one(`select status from ideas where title like 'Format%'`)).status).toBe("ignoree");
  await page.getByRole("tab", { name: "Ignorées" }).click();
  await expect(page.getByText(/la journée type/i).first()).toBeVisible();
  await page.getByRole("tab", { name: /aujourd.hui/i }).click();
  await a.getByRole("button", { name: /transformer en tâche/i }).click();
  await dialog(page).getByLabel("Responsable").selectOption({ label: "Arthur Pomarede" });
  await dialog(page).getByLabel("Échéance").fill(plusDays(4));
  await submit(page, "[role=dialog] form button[type=submit]");
  await expect(page.getByText("Transformée en tâche", { exact: true })).toBeVisible();
  const t = await one(`select t.title, t.description, t.due_date::text as d, u.email from tasks t join users u on u.id = t.assignee_id where t.title like 'Portrait%'`);
  expect(t.email).toBe("arthur@test.local"); expect(t.d).toBe(plusDays(4)); expect(t.description).toContain("Contacter la production"); expect(t.description).toContain("https://example.org/a");
  expect((await one(`select task_id is not null as l, status from ideas where title like 'Portrait%'`))).toEqual({ l: true, status: "transformee" });
  await ctx.close();
});

/* ───────────── Ressources ───────────── */
test("ressources : charte officielle affichée, modèle de message copiable, ressource restreinte invisible pour Arthur", async ({ browser }) => {
  const eliott = await session(browser, "eliott");
  const arthur = await session(browser, "arthur");
  await eliott.ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await eliott.page.goto("/ressources");
  await expect(eliott.page.getByText("Charte officielle")).toBeVisible();
  for (const hex of ["#DFC662", "#F5F4F0", "#000000"]) await expect(eliott.page.getByText(hex).first()).toBeVisible();
  expect((await eliott.page.request.get("/brand/logo-tile.png")).status()).toBe(200);
  // modèle de mail
  await eliott.page.getByRole("tab", { name: /communication/i }).click();
  await eliott.page.getByRole("button", { name: /ajouter une ressource/i }).first().click();
  await dialog(eliott.page).getByLabel("Catégorie").selectOption("Mail de prospection");
  await dialog(eliott.page).getByLabel("Titre").fill("Mail de prospection — invité de l'ombre");
  await dialog(eliott.page).getByLabel(/texte \(modèle/i).fill("Bonjour {prénom},\n\nNous préparons « De l'Ombre à la Lumière »…");
  await submit(eliott.page, "[role=dialog] form button[type=submit]");
  await eliott.page.goto("/ressources");
  await eliott.page.getByRole("tab", { name: /communication/i }).click();
  await eliott.page.getByText("Mail de prospection — invité de l'ombre").click();
  await dialog(eliott.page).getByRole("button", { name: "Copier" }).click();
  await expect(eliott.page.getByText(/copié dans le presse-papiers/i)).toBeVisible();
  expect(await eliott.page.evaluate(() => navigator.clipboard.readText())).toContain("Bonjour {prénom}");
  await dialog(eliott.page).getByRole("button", { name: "Fermer" }).click();
  // ressource restreinte
  await eliott.page.getByRole("tab", { name: /documents/i }).click();
  await eliott.page.getByRole("button", { name: /ajouter une ressource/i }).first().click();
  await dialog(eliott.page).getByLabel("Catégorie").selectOption("Contrats");
  await dialog(eliott.page).getByLabel("Titre").fill("Contrat prestataire montage");
  await dialog(eliott.page).getByLabel("Lien (Google Drive, Canva…)").fill("https://docs.google.com/document/d/contrat-test/edit");
  await eliott.page.getByText(/ressource restreinte/i).click();
  await submit(eliott.page, "[role=dialog] form button[type=submit]");
  await expect.poll(async () => (await one(`select restricted from resources where title = 'Contrat prestataire montage'`)).restricted).toBe(true);
  await eliott.page.goto("/ressources");
  await eliott.page.getByRole("tab", { name: /documents/i }).click();
  await expect(eliott.page.getByText("Contrat prestataire montage")).toBeVisible();
  await eliott.page.goto("/drive");
  await expect(eliott.page.getByText("Contrat prestataire montage")).toBeVisible(); // lien Drive listé pour Eliott
  // Arthur : ni liste, ni recherche, ni page Drive
  await arthur.page.goto("/ressources");
  await arthur.page.getByRole("tab", { name: /documents/i }).click();
  await expect(arthur.page.getByText("Contrat prestataire montage")).toHaveCount(0);
  await expect(arthur.page.getByRole("tab", { name: /communication/i })).toBeVisible();
  await arthur.page.getByRole("tab", { name: /communication/i }).click();
  await expect(arthur.page.getByText("Mail de prospection — invité de l'ombre")).toBeVisible(); // non restreinte : visible
  await arthur.page.goto("/drive");
  await expect(arthur.page.getByText("Contrat prestataire montage")).toHaveCount(0);
  await arthur.page.keyboard.press("Control+k");
  await arthur.page.getByPlaceholder(/invités, épisodes/i).fill("Contrat prestataire");
  await expect(arthur.page.getByText(/aucun résultat/i)).toBeVisible();
  await eliott.ctx.close(); await arthur.ctx.close();
});

test("Google Drive non connecté : application fonctionnelle, état clair, liens collés utilisables", async ({ browser }) => {
  const { ctx, page } = await session(browser, "eliott");
  await page.goto("/drive");
  await expect(page.getByText("Non configuré")).toBeVisible();
  await expect(page.getByText(/GOOGLE_CLIENT_ID \/ GOOGLE_CLIENT_SECRET/)).toBeVisible();
  await expect(page.getByText(/l.application reste utilisable/i)).toBeVisible();
  // associer un dossier par son lien à un épisode (sans OAuth)
  const [ep] = await q(`select id from episodes limit 1`);
  await page.goto("/production/" + ep.id);
  await page.getByPlaceholder("Coller le lien d'un dossier existant").fill("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv");
  await page.getByPlaceholder("Coller le lien d'un dossier existant").locator("xpath=following-sibling::button").click();
  await expect(page.getByRole("link", { name: /ouvrir dans drive/i })).toHaveAttribute("href", /1AbCdEfGhIjKlMnOpQrStUv/);
  await expect(page.getByText(/connectez google drive pour parcourir/i)).toBeVisible();
  expect((await one(`select drive_folder_id from episodes where id = '${ep.id}'`)).drive_folder_id).toBe("1AbCdEfGhIjKlMnOpQrStUv");
  await ctx.close();
});
