import "server-only";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { addDaysISO, todayISO, utcToParis } from "@/lib/dates";
import { CONTENT_KIND, CONTENT_KIND_PLATFORM, EPISODE_STAGES, stageIndex, type EpisodeStage } from "@/lib/labels";
import { notify, notifyAll } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { createEpisodeFolder } from "@/lib/integrations/drive";

/**
 * Automatisations : les modules communiquent entre eux.
 * Chaque élément créé automatiquement porte une `automationKey` unique → jamais de doublon,
 * même si l'automatisation est relancée.
 */
type Actor = { id: string; name: string };
export type AutomationReport = { created: string[]; skipped: string[] };

async function ensureTask(r: AutomationReport, key: string, v: { title: string; description?: string; assigneeId: string | null; createdBy: string; dueDate?: string | null; priority?: "basse" | "normale" | "haute" | "urgente"; episodeId?: string | null; contactId?: string | null }) {
  const rows = await db.insert(s.tasks).values({ ...v, automationKey: key }).onConflictDoNothing().returning({ id: s.tasks.id });
  (rows.length ? r.created : r.skipped).push(`Tâche « ${v.title} »`);
  if (rows.length && v.assigneeId && v.assigneeId !== v.createdBy) {
    await notify({ userIds: [v.assigneeId], type: "tache_attribuee", title: `Nouvelle tâche : ${v.title}`, body: "Créée automatiquement", link: `/missions?tache=${rows[0].id}`, actorId: v.createdBy });
  }
}

async function ensureEvent(r: AutomationReport, key: string, v: typeof s.events.$inferInsert) {
  const rows = await db.insert(s.events).values({ ...v, automationKey: key }).onConflictDoNothing().returning({ id: s.events.id });
  if (!rows.length) {
    // Met à jour la date si l'événement existe déjà (ex. date de tournage modifiée)
    await db.update(s.events).set({ startsAt: v.startsAt, endsAt: v.endsAt, title: v.title, updatedAt: new Date() }).where(eq(s.events.automationKey, key));
    r.skipped.push(`Événement « ${v.title} » (mis à jour)`);
  } else r.created.push(`Événement « ${v.title} »`);
}

/** Duplique un modèle de checklist pour un épisode (une seule fois par phase). */
export async function ensureChecklistFromTemplate(r: AutomationReport, episodeId: string, phase: "avant" | "apres", actorId: string, eventId?: string | null) {
  const existing = await db.select().from(s.checklists).where(and(eq(s.checklists.episodeId, episodeId), eq(s.checklists.phase, phase), eq(s.checklists.isTemplate, false)));
  if (existing.length) { r.skipped.push(`Checklist ${phase === "avant" ? "avant" : "après"} tournage (déjà présente)`); return; }
  const [tpl] = await db.select().from(s.checklists).where(and(eq(s.checklists.isTemplate, true), eq(s.checklists.phase, phase))).limit(1);
  if (!tpl) { r.skipped.push(`Aucun modèle de checklist « ${phase} »`); return; }
  const items = await db.select().from(s.checklistItems).where(eq(s.checklistItems.checklistId, tpl.id)).orderBy(s.checklistItems.position);
  const [cl] = await db.insert(s.checklists).values({ name: tpl.name, phase, episodeId, eventId: eventId ?? null, sourceTemplateId: tpl.id, createdBy: actorId }).returning();
  if (items.length) await db.insert(s.checklistItems).values(items.map((it) => ({ checklistId: cl.id, label: it.label, position: it.position })));
  r.created.push(`Checklist « ${tpl.name} »`);
}

export async function markStagesUpTo(episodeId: string, stage: EpisodeStage, actorId: string) {
  const idx = stageIndex(stage);
  const rows = EPISODE_STAGES.slice(0, idx + 1).map(([k]) => ({ episodeId, stage: k, completedBy: actorId }));
  await db.insert(s.episodeStages).values(rows).onConflictDoNothing();
}

/** Invité confirmé → fiche épisode (si demandée), date de tournage, tâches, checklist, Drive, calendrier. */
export async function onGuestConfirmed(opts: {
  contactId: string; actor: Actor; createEpisode: boolean; episodeTitle?: string; shootDate?: Date | null; shootLocation?: string | null;
  producerId?: string | null; createDrive: boolean;
}): Promise<AutomationReport & { episodeId: string | null }> {
  const r: AutomationReport = { created: [], skipped: [] };
  const [c] = await db.select().from(s.contacts).where(eq(s.contacts.id, opts.contactId));
  if (!c) throw new Error("⚠ Contact introuvable");
  const name = `${c.firstName} ${c.lastName}`.trim();
  let [ep] = await db.select().from(s.episodes).where(and(eq(s.episodes.contactId, c.id), isNull(s.episodes.archivedAt))).limit(1);
  if (!ep && opts.createEpisode) {
    [ep] = await db.insert(s.episodes).values({
      title: opts.episodeTitle?.trim() || name, contactId: c.id, stage: "confirme", producerId: opts.producerId ?? opts.actor.id,
      shootDate: opts.shootDate ?? null, shootLocation: opts.shootLocation ?? null, createdBy: opts.actor.id,
    }).returning();
    r.created.push(`Fiche épisode « ${ep.title} »`);
    await audit({ userId: opts.actor.id, action: "episode.creation_auto", entityType: "episode", entityId: ep.id, summary: `Épisode créé depuis la confirmation de ${name}` });
  } else if (ep) {
    r.skipped.push(`Fiche épisode (existe déjà : « ${ep.title} »)`);
    const patch: Partial<typeof s.episodes.$inferInsert> = { updatedAt: new Date() };
    if (stageIndex(ep.stage) < stageIndex("confirme")) patch.stage = "confirme";
    if (opts.shootDate) patch.shootDate = opts.shootDate;
    if (opts.shootLocation) patch.shootLocation = opts.shootLocation;
    [ep] = await db.update(s.episodes).set(patch).where(eq(s.episodes.id, ep.id)).returning();
  }
  // Le contact passe dans « Invités reçus » (il a accepté)
  await db.update(s.contacts).set({ category: "invite_recu", responseReceived: true, shootDate: opts.shootDate ? utcToParis(opts.shootDate).date : c.shootDate, nextFollowupAt: null, updatedAt: new Date() }).where(eq(s.contacts.id, c.id));
  if (!ep) return { ...r, episodeId: null };

  await markStagesUpTo(ep.id, "confirme", opts.actor.id);
  await prepareEpisode(r, ep, opts.actor, opts.createDrive);
  await notifyAll({ type: "invite_confirme", title: `${name} a confirmé l'interview`, body: ep.shootDate ? `Tournage prévu le ${utcToParis(ep.shootDate).date}` : "Date de tournage à fixer", link: `/production/${ep.id}`, actorId: opts.actor.id });
  return { ...r, episodeId: ep.id };
}

/** Étape « interview confirmée » : tâches préparatoires, checklist, calendrier, Drive. */
async function prepareEpisode(r: AutomationReport, ep: typeof s.episodes.$inferSelect, actor: Actor, createDrive: boolean) {
  const owner = ep.producerId ?? actor.id;
  const shoot = ep.shootDate ? utcToParis(ep.shootDate).date : null;
  const before = (n: number) => (shoot ? addDaysISO(shoot, -n) : null);
  await ensureTask(r, `ep:${ep.id}:questions`, { title: `Préparer les questions — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: before(3), priority: "haute", episodeId: ep.id, contactId: ep.contactId });
  await ensureTask(r, `ep:${ep.id}:appel_prep`, { title: `Appel de préparation avec l'invité — ${ep.title}`, description: "Son parcours, ses moments clés, ce qu'il a envie de raconter.", assigneeId: owner, createdBy: actor.id, dueDate: before(5), episodeId: ep.id, contactId: ep.contactId });
  await ensureTask(r, `ep:${ep.id}:autorisations`, { title: `Récupérer les autorisations (droit à l'image, diffusion) — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: shoot, priority: "haute", episodeId: ep.id, contactId: ep.contactId });
  await ensureTask(r, `ep:${ep.id}:studio`, { title: `Réserver / confirmer le studio — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: before(7), episodeId: ep.id });
  // Documents administratifs attendus (statut « manquant » tant qu'aucune preuve n'est fournie)
  if (ep.contactId) {
    for (const kind of ["droit_image", "autorisation_diffusion"] as const) {
      const ex = await db.select({ id: s.guestDocuments.id }).from(s.guestDocuments).where(and(eq(s.guestDocuments.contactId, ep.contactId), eq(s.guestDocuments.kind, kind)));
      if (!ex.length) {
        await db.insert(s.guestDocuments).values({ contactId: ep.contactId, episodeId: ep.id, kind, title: kind === "droit_image" ? "Autorisation de droit à l'image" : "Autorisation de diffusion" });
        r.created.push(kind === "droit_image" ? "Document attendu : droit à l'image" : "Document attendu : autorisation de diffusion");
      }
    }
  }
  let eventId: string | null = null;
  if (ep.shootDate) {
    await ensureEvent(r, `ep:${ep.id}:tournage`, {
      title: `Tournage — ${ep.title}`, type: "tournage", startsAt: ep.shootDate, endsAt: new Date(ep.shootDate.getTime() + 3 * 3600_000),
      assigneeId: owner, contactId: ep.contactId, episodeId: ep.id, location: ep.shootLocation, createdBy: actor.id,
    });
    const [ev] = await db.select({ id: s.events.id }).from(s.events).where(eq(s.events.automationKey, `ep:${ep.id}:tournage`));
    eventId = ev?.id ?? null;
  } else r.skipped.push("Événement de tournage (date de tournage non définie)");
  await ensureChecklistFromTemplate(r, ep.id, "avant", actor.id, eventId);
  if (createDrive && !ep.driveFolderId) {
    try {
      const f = await createEpisodeFolder(ep.number ? `Ép. ${String(ep.number).padStart(2, "0")} — ${ep.title}` : ep.title);
      if (f) {
        await db.update(s.episodes).set({ driveFolderId: f.id, driveFolderUrl: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}` }).where(eq(s.episodes.id, ep.id));
        r.created.push("Dossier Google Drive (avec sous-dossiers)");
      } else r.skipped.push("Dossier Drive (Google Drive non connecté)");
    } catch (e) { r.skipped.push(`Dossier Drive (erreur : ${(e as Error).message.replace("⚠ ", "")})`); }
  }
}

/** Changement d'étape d'un épisode : déclenche les automatisations correspondantes. */
export async function onEpisodeStage(episodeId: string, stage: EpisodeStage, actor: Actor, opts: { createDrive?: boolean } = {}): Promise<AutomationReport> {
  const r: AutomationReport = { created: [], skipped: [] };
  let [ep] = await db.select().from(s.episodes).where(eq(s.episodes.id, episodeId));
  if (!ep) throw new Error("⚠ Épisode introuvable");
  const owner = ep.producerId ?? actor.id;

  if (stage === "confirme" || stage === "preparation") {
    await prepareEpisode(r, ep, actor, opts.createDrive ?? false);
    if (ep.contactId) await db.update(s.contacts).set({ category: "invite_recu", responseReceived: true, updatedAt: new Date() }).where(eq(s.contacts.id, ep.contactId));
  }

  if (stage === "tournage_realise") {
    // Tournage terminé → l'épisode passe directement en montage
    stage = "montage";
    r.created.push("Épisode passé en « Montage en cours »");
    const today = todayISO();
    await ensureTask(r, `ep:${ep.id}:montage`, { title: `Monter l'épisode — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: addDaysISO(today, 7), priority: "haute", episodeId: ep.id });
    await ensureTask(r, `ep:${ep.id}:sauvegarde`, { title: `Sauvegarder et organiser les rushs — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: today, priority: "urgente", episodeId: ep.id });
    await ensureTask(r, `ep:${ep.id}:remerciement`, { title: `Remercier l'invité — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: addDaysISO(today, 1), episodeId: ep.id, contactId: ep.contactId });
    await ensureChecklistFromTemplate(r, ep.id, "apres", actor.id);
    await ensureDeclinations(r, ep, owner);
    const valDate = addDaysISO(today, 10);
    await ensureEvent(r, `ep:${ep.id}:validation`, { title: `Validation du montage — ${ep.title}`, type: "validation", startsAt: new Date(valDate + "T08:00:00Z"), allDay: true, assigneeId: owner, episodeId: ep.id, createdBy: actor.id });
    await ensureTask(r, `ep:${ep.id}:validation`, { title: `Valider le montage — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: valDate, episodeId: ep.id });
    await notifyAll({ type: "production", title: `Tournage terminé : ${ep.title}`, body: "L'épisode passe en montage.", link: `/production/${ep.id}`, actorId: actor.id });
  }

  if (stage === "publication") {
    const now = new Date();
    const links = ep.publicationLinks ?? {};
    await db.update(s.contents).set({ status: "publie", publishedAt: now, updatedAt: now })
      .where(and(eq(s.contents.episodeId, ep.id), inArray(s.contents.kind, ["youtube_complet", "audio"]), sql`${s.contents.publicationUrl} is not null`));
    if (ep.contactId) {
      await db.update(s.contacts).set({ category: "invite_recu", publishDate: todayISO(), episodeUrl: links.youtube ?? links.spotify ?? links.apple ?? null, updatedAt: now }).where(eq(s.contacts.id, ep.contactId));
      r.created.push("Fiche invité mise à jour (date et lien de publication)");
    }
    const t = todayISO();
    await ensureTask(r, `ep:${ep.id}:stats_j7`, { title: `Relever les statistiques J+7 — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: addDaysISO(t, 7), episodeId: ep.id });
    await ensureTask(r, `ep:${ep.id}:stats_j30`, { title: `Relever les statistiques J+30 — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: addDaysISO(t, 30), episodeId: ep.id });
    await ensureTask(r, `ep:${ep.id}:promo`, { title: `Promotion de l'épisode (Reels, TikTok, Shorts) — ${ep.title}`, assigneeId: owner, createdBy: actor.id, dueDate: addDaysISO(t, 3), episodeId: ep.id });
    await db.update(s.episodes).set({ publishedAt: ep.publishedAt ?? now }).where(eq(s.episodes.id, ep.id));
    r.created.push("Étapes précédentes archivées comme terminées");
    await notifyAll({ type: "production", title: `Épisode publié : ${ep.title}`, link: `/production/${ep.id}`, actorId: actor.id });
  }

  if (stage === "promotion_terminee") {
    await db.update(s.tasks).set({ status: "termine", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.tasks.automationKey, `ep:${ep.id}:promo`), ne(s.tasks.status, "termine")));
  }

  [ep] = await db.update(s.episodes).set({ stage, updatedAt: new Date() }).where(eq(s.episodes.id, ep.id)).returning();
  await markStagesUpTo(ep.id, stage, actor.id);
  return r;
}

/** Prépare les déclinaisons de contenu d'un épisode (une par format, sans doublon). */
export async function ensureDeclinations(r: AutomationReport, ep: typeof s.episodes.$inferSelect, owner: string) {
  const existing = await db.select({ kind: s.contents.kind }).from(s.contents).where(eq(s.contents.episodeId, ep.id));
  const have = new Set(existing.map((e) => e.kind));
  const kinds = Object.keys(CONTENT_KIND) as (keyof typeof CONTENT_KIND)[];
  const missing = kinds.filter((k) => !have.has(k));
  if (missing.length) {
    await db.insert(s.contents).values(missing.map((k) => ({
      episodeId: ep.id, kind: k, title: `${CONTENT_KIND[k]} — ${ep.title}`, platform: CONTENT_KIND_PLATFORM[k], ownerId: owner, plannedDate: ep.plannedPublishDate,
    })));
    r.created.push(`${missing.length} déclinaison(s) de contenu`);
  } else r.skipped.push("Déclinaisons de contenu (déjà présentes)");
}

/**
 * Rappels quotidiens (appelé par la tâche planifiée) : échéances proches → notification interne
 * au responsable. Clé de déduplication par jour : jamais deux fois la même alerte.
 */
export async function runDailyReminders() {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  let sent = 0;
  const tasks = await db.select().from(s.tasks).where(and(ne(s.tasks.status, "termine"), sql`${s.tasks.dueDate} <= ${tomorrow}`));
  const users = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.active, true));
  const everyone = users.map((u) => u.id);
  for (const t of tasks) {
    const late = t.dueDate! < today;
    await notify({ userIds: t.assigneeId ? [t.assigneeId] : everyone, type: "echeance", includeActor: true,
      title: late ? `En retard : ${t.title}` : t.dueDate === today ? `Échéance aujourd'hui : ${t.title}` : `Échéance demain : ${t.title}`,
      link: `/missions?tache=${t.id}`, dedupeKey: `task:${t.id}:${today}` });
    sent++;
  }
  const relances = await db.select().from(s.contacts).where(and(isNull(s.contacts.archivedAt), sql`${s.contacts.nextFollowupAt} <= ${today}`, ne(s.contacts.category, "invite_recu")));
  for (const c of relances) {
    await notify({ userIds: c.ownerId ? [c.ownerId] : everyone, type: "relance", includeActor: true, title: `Relance du jour : ${c.firstName} ${c.lastName}`.trim(), link: `/crm/${c.id}`, dedupeKey: `relance:${c.id}:${today}` });
    sent++;
  }
  const eps = await db.select().from(s.episodes).where(and(isNull(s.episodes.archivedAt), sql`${s.episodes.shootDate} is not null`));
  for (const e of eps) {
    const d = utcToParis(e.shootDate!).date;
    if (d === tomorrow || d === addDaysISO(today, 3)) {
      await notify({ userIds: everyone, type: "tournage", includeActor: true, title: `Tournage ${d === tomorrow ? "demain" : "dans 3 jours"} : ${e.title}`, link: `/production/${e.id}`, dedupeKey: `shoot:${e.id}:${today}` });
      sent++;
    }
  }
  const fin = await db.select().from(s.transactions).where(and(eq(s.transactions.status, "a_regler"), sql`${s.transactions.dueDate} <= ${addDaysISO(today, 3)}`));
  if (fin.length) {
    const admins = await db.select({ id: s.users.id, role: s.users.role, o: s.users.permissionOverrides }).from(s.users).where(eq(s.users.active, true));
    const { can } = await import("@/lib/auth/permissions");
    const finUsers = admins.filter((a) => can({ role: a.role, permissionOverrides: a.o }, "finances.voir")).map((a) => a.id);
    for (const f of fin) { await notify({ userIds: finUsers, type: "finance", includeActor: true, title: `Échéance financière : ${f.description}`, link: `/finances?op=${f.id}`, dedupeKey: `fin:${f.id}:${today}` }); sent++; }
  }
  return { sent };
}
