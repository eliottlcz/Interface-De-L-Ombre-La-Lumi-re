"use server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { notifyAll, notify } from "@/lib/notify";
import { parisToUtc } from "@/lib/dates";
import { EPISODE_STAGE, CONTENT_KIND, type EpisodeStage } from "@/lib/labels";
import { ensureChecklistFromTemplate, ensureDeclinations, onEpisodeStage, type AutomationReport } from "@/lib/automations";
import { createEpisodeFolder, folderIdFromUrl } from "@/lib/integrations/drive";

const blank = (v: unknown) => (v === "" ? null : v);
const optStr = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable().optional());
const optUrl = z.preprocess(blank, z.url({ message: "Lien invalide" }).nullable().optional());
const optDate = z.preprocess(blank, z.iso.date().nullable().optional());
const STAGES = ["identifie", "premier_contact", "interesse", "confirme", "preparation", "tournage_realise", "montage", "validation", "habillage", "programmation", "publication", "promotion_terminee"] as const;

const EpisodeInput = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(300),
  number: z.preprocess((v) => (v === "" || v === null ? null : Number(v)), z.number().int().positive().nullable().optional()),
  contactId: z.preprocess(blank, z.uuid().nullable().optional()),
  producerId: z.preprocess(blank, z.uuid().nullable().optional()),
  shootDay: optDate, shootTime: optStr(5),
  shootLocation: optStr(300), prepNotes: optStr(50000), interviewQuestions: optStr(50000),
  videoUrl: optUrl, audioUrl: optUrl, graphicsUrl: optUrl, adminDocsUrl: optUrl,
  plannedPublishDate: optDate,
  publicationLinks: z.object({ youtube: z.string().optional(), spotify: z.string().optional(), apple: z.string().optional(), deezer: z.string().optional(), instagram: z.string().optional(), tiktok: z.string().optional(), autre: z.string().optional() }).partial().default({}),
  driveFolderUrl: optStr(1000),
});
export type EpisodeInputT = z.input<typeof EpisodeInput>;

function toRow(v: z.output<typeof EpisodeInput>) {
  const { shootDay, shootTime, publicationLinks, driveFolderUrl, ...rest } = v;
  const links = Object.fromEntries(Object.entries(publicationLinks).filter(([, x]) => x && x.trim()).map(([k, x]) => [k, x!.trim()]));
  for (const [k, x] of Object.entries(links)) if (!/^https?:\/\//.test(x)) userError(`Lien de publication ${k} invalide (doit commencer par https://)`);
  return {
    ...rest, publicationLinks: links,
    shootDate: shootDay ? parisToUtc(shootDay, shootTime || "10:00") : null,
    driveFolderUrl: driveFolderUrl || null, driveFolderId: driveFolderUrl ? folderIdFromUrl(driveFolderUrl) : null,
  };
}

export async function createEpisode(input: EpisodeInputT) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const v = EpisodeInput.parse(input);
    const [e] = await db.insert(s.episodes).values({ ...toRow(v), producerId: v.producerId ?? u.id, createdBy: u.id }).returning();
    await db.insert(s.episodeStages).values({ episodeId: e.id, stage: "identifie", completedBy: u.id }).onConflictDoNothing();
    await audit({ userId: u.id, action: "episode.creation", entityType: "episode", entityId: e.id, summary: `Épisode « ${e.title} » créé` });
    await notifyAll({ type: "production", title: `Nouvel épisode : ${e.title}`, link: `/production/${e.id}`, actorId: u.id });
    return { ok: true as const, data: e.id, message: "Épisode créé" };
  });
}

export async function updateEpisode(id: string, input: EpisodeInputT) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const v = EpisodeInput.parse(input);
    const [before] = await db.select().from(s.episodes).where(eq(s.episodes.id, id));
    if (!before) userError("Épisode introuvable");
    const row = toRow(v);
    const [e] = await db.update(s.episodes).set({ ...row, updatedAt: new Date() }).where(eq(s.episodes.id, id)).returning();
    // La date de tournage modifiée se répercute sur l'événement du calendrier
    if (e.shootDate && (before.shootDate?.getTime() !== e.shootDate.getTime() || before.shootLocation !== e.shootLocation)) {
      await db.update(s.events).set({ startsAt: e.shootDate, endsAt: new Date(e.shootDate.getTime() + 3 * 3600_000), location: e.shootLocation, updatedAt: new Date() }).where(eq(s.events.automationKey, `ep:${id}:tournage`));
      if (e.contactId) await db.update(s.contacts).set({ shootDate: v.shootDay ?? null }).where(eq(s.contacts.id, e.contactId));
    }
    if (e.producerId && e.producerId !== before.producerId)
      await notify({ userIds: [e.producerId], type: "production", title: `${u.name} vous a confié la production de « ${e.title} »`, link: `/production/${id}`, actorId: u.id });
    await audit({ userId: u.id, action: "episode.modification", entityType: "episode", entityId: id, summary: `Fiche épisode « ${e.title} » modifiée` });
    return { ok: true as const, message: "Fiche épisode enregistrée" };
  });
}

/** Valide une étape : déclenche les automatisations et renvoie le compte-rendu. */
export async function setEpisodeStage(id: string, stage: EpisodeStage, opts: { createDrive?: boolean } = {}) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    z.enum(STAGES).parse(stage);
    const r: AutomationReport = await onEpisodeStage(id, stage, { id: u.id, name: u.name }, opts);
    const [e] = await db.select({ title: s.episodes.title, stage: s.episodes.stage }).from(s.episodes).where(eq(s.episodes.id, id));
    await audit({ userId: u.id, action: "episode.etape", entityType: "episode", entityId: id, summary: `« ${e.title} » → ${EPISODE_STAGE[e.stage]}`, metadata: r });
    await notifyAll({ type: "production", title: `${e.title} : ${EPISODE_STAGE[e.stage]}`, body: `Étape validée par ${u.name}`, link: `/production/${id}`, actorId: u.id, dedupeKey: `stage:${id}:${e.stage}` });
    return { ok: true as const, data: r, message: `Étape « ${EPISODE_STAGE[e.stage]} » validée` };
  });
}

/** Revenir à une étape antérieure (correction). Les étapes postérieures sont dévalidées. */
export async function rollbackEpisodeStage(id: string, stage: EpisodeStage) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const idx = STAGES.indexOf(stage);
    await db.update(s.episodes).set({ stage, updatedAt: new Date() }).where(eq(s.episodes.id, id));
    await db.delete(s.episodeStages).where(and(eq(s.episodeStages.episodeId, id), inArray(s.episodeStages.stage, STAGES.slice(idx + 1) as unknown as EpisodeStage[])));
    await audit({ userId: u.id, action: "episode.retour_etape", entityType: "episode", entityId: id, summary: `Retour à l'étape « ${EPISODE_STAGE[stage]} »` });
    return { ok: true as const, message: `Retour à « ${EPISODE_STAGE[stage]} »` };
  });
}

export async function setEpisodeArchived(id: string, archived: boolean) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    await db.update(s.episodes).set({ archivedAt: archived ? new Date() : null }).where(eq(s.episodes.id, id));
    await audit({ userId: u.id, action: archived ? "episode.archivage" : "episode.desarchivage", entityType: "episode", entityId: id, summary: archived ? "Épisode archivé" : "Épisode restauré" });
    return { ok: true as const, message: archived ? "Épisode archivé" : "Épisode restauré" };
  });
}

export async function deleteEpisode(id: string) {
  return run(async () => {
    const u = await assertPermission("production.supprimer");
    const [e] = await db.select().from(s.episodes).where(eq(s.episodes.id, id));
    if (!e) userError("Épisode introuvable");
    await db.delete(s.attachments).where(and(eq(s.attachments.entityType, "episode"), eq(s.attachments.entityId, id)));
    await db.delete(s.episodes).where(eq(s.episodes.id, id));
    await audit({ userId: u.id, action: "episode.suppression", entityType: "episode", entityId: id, sensitive: true, summary: `Épisode « ${e.title} » supprimé`, metadata: { title: e.title, number: e.number } });
    return { ok: true as const, message: "Épisode supprimé" };
  });
}

export async function createDriveFolderForEpisode(id: string) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [e] = await db.select().from(s.episodes).where(eq(s.episodes.id, id));
    if (!e) userError("Épisode introuvable");
    if (e.driveFolderId) userError("Un dossier Drive est déjà associé à cet épisode.");
    const f = await createEpisodeFolder(e.number ? `Ép. ${String(e.number).padStart(2, "0")} — ${e.title}` : e.title);
    if (!f) userError("Google Drive n'est pas connecté (Paramètres → Intégrations).");
    await db.update(s.episodes).set({ driveFolderId: f.id, driveFolderUrl: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}` }).where(eq(s.episodes.id, id));
    await audit({ userId: u.id, action: "drive.dossier_cree", entityType: "episode", entityId: id, summary: `Dossier Drive créé pour « ${e.title} »` });
    return { ok: true as const, message: "Dossier Drive créé avec ses sous-dossiers" };
  });
}

export async function prepareDeclinations(id: string) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [e] = await db.select().from(s.episodes).where(eq(s.episodes.id, id));
    if (!e) userError("Épisode introuvable");
    const r: AutomationReport = { created: [], skipped: [] };
    await ensureDeclinations(r, e, e.producerId ?? u.id);
    return { ok: true as const, message: r.created[0] ?? "Toutes les déclinaisons existent déjà" };
  });
}

export async function addEpisodeChecklist(id: string, phase: "avant" | "apres") {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const r: AutomationReport = { created: [], skipped: [] };
    await ensureChecklistFromTemplate(r, id, phase, u.id);
    return { ok: true as const, message: r.created[0] ?? r.skipped[0] };
  });
}

/* ───────── Déclinaisons de contenu ───────── */
const ContentInput = z.object({
  episodeId: z.preprocess(blank, z.uuid().nullable().optional()),
  kind: z.enum(["youtube_complet", "audio", "short", "reel", "tiktok", "teaser", "citation", "promo"]),
  title: z.string().trim().min(1, "Titre obligatoire").max(300),
  platform: z.string().trim().min(1).max(40),
  ownerId: z.preprocess(blank, z.uuid().nullable().optional()),
  status: z.enum(["a_produire", "en_montage", "a_valider", "programme", "publie"]).default("a_produire"),
  plannedDate: optDate, fileUrl: optUrl, publicationUrl: optUrl,
});
export type ContentInputT = z.input<typeof ContentInput>;

export async function saveContent(id: string | null, input: ContentInputT) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const v = ContentInput.parse(input);
    if (v.status === "publie" && !v.publicationUrl) userError("Ajoutez le lien de la publication pour la marquer « Publié ».");
    let row;
    if (id) {
      const [before] = await db.select().from(s.contents).where(eq(s.contents.id, id));
      [row] = await db.update(s.contents).set({ ...v, publishedAt: v.status === "publie" ? before?.publishedAt ?? new Date() : null, updatedAt: new Date() }).where(eq(s.contents.id, id)).returning();
      if (v.ownerId && v.ownerId !== before?.ownerId) await notify({ userIds: [v.ownerId], type: "production", title: `${u.name} vous a confié « ${v.title} »`, link: v.episodeId ? `/production/${v.episodeId}#contenus` : "/contenus", actorId: u.id });
    } else {
      [row] = await db.insert(s.contents).values({ ...v, ownerId: v.ownerId ?? u.id, publishedAt: v.status === "publie" ? new Date() : null }).returning();
    }
    // Lien de publication de l'épisode complet → reporté sur la fiche épisode
    if (row.episodeId && row.publicationUrl && (row.kind === "youtube_complet" || row.kind === "audio")) {
      const [ep] = await db.select().from(s.episodes).where(eq(s.episodes.id, row.episodeId));
      const key = row.kind === "youtube_complet" ? "youtube" : "spotify";
      if (ep && !ep.publicationLinks?.[key]) await db.update(s.episodes).set({ publicationLinks: { ...ep.publicationLinks, [key]: row.publicationUrl } }).where(eq(s.episodes.id, ep.id));
    }
    await audit({ userId: u.id, action: id ? "contenu.modification" : "contenu.creation", entityType: "content", entityId: row.id, summary: `Contenu « ${row.title} » (${CONTENT_KIND[row.kind]})` });
    return { ok: true as const, data: row.id, message: id ? "Contenu enregistré" : "Contenu ajouté" };
  });
}

export async function setContentStatus(id: string, status: "a_produire" | "en_montage" | "a_valider" | "programme" | "publie") {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [c] = await db.select().from(s.contents).where(eq(s.contents.id, id));
    if (!c) userError("Contenu introuvable");
    if (status === "publie" && !c.publicationUrl) userError("Ajoutez d'abord le lien de la publication (ouvrez le contenu).");
    await db.update(s.contents).set({ status, publishedAt: status === "publie" ? c.publishedAt ?? new Date() : null, updatedAt: new Date() }).where(eq(s.contents.id, id));
    if (status === "a_valider") await notifyAll({ type: "production", title: `À valider : ${c.title}`, link: c.episodeId ? `/production/${c.episodeId}#contenus` : "/contenus", actorId: u.id });
    return { ok: true as const };
  });
}

export async function deleteContent(id: string) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [c] = await db.delete(s.contents).where(eq(s.contents.id, id)).returning();
    if (c) await audit({ userId: u.id, action: "contenu.suppression", entityType: "content", entityId: id, summary: `Contenu « ${c.title} » supprimé` });
    return { ok: true as const, message: "Contenu supprimé" };
  });
}


export async function moveContentDate(id: string, date: string) {
  return run(async () => {
    await assertPermission("production.modifier");
    await db.update(s.contents).set({ plannedDate: z.iso.date().parse(date), updatedAt: new Date() }).where(eq(s.contents.id, id));
    return { ok: true as const, message: "Publication déplacée" };
  });
}
