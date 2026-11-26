"use server";
import { and, desc, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { euros, formatDate } from "@/lib/dates";
import { CONTENT_KIND, EPISODE_STAGE, TASK_STATUS } from "@/lib/labels";

export type SearchHit = { id: string; title: string; subtitle?: string; href: string; external?: boolean };
export type SearchGroup = { key: string; label: string; hits: SearchHit[] };

export async function searchAll(q: string): Promise<SearchGroup[]> {
  const u = await assertUser();
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const L = 6;
  const groups: SearchGroup[] = [];
  const s = schema;

  if (can(u, "crm.voir")) {
    const rows = await db.select().from(s.contacts).where(or(
      ilike(sql`${s.contacts.firstName} || ' ' || ${s.contacts.lastName}`, like), ilike(s.contacts.email, like),
      ilike(s.contacts.profession, like), ilike(s.contacts.company, like), ilike(s.contacts.notes, like))).limit(L);
    groups.push({ key: "invites", label: "Invités & contacts", hits: rows.map((c) => ({ id: c.id, title: `${c.firstName} ${c.lastName}`.trim(), subtitle: [c.profession, c.company].filter(Boolean).join(" · "), href: `/crm/${c.id}` })) });
  }
  if (can(u, "production.voir")) {
    const eps = await db.select().from(s.episodes).where(or(ilike(s.episodes.title, like), ilike(s.episodes.prepNotes, like), ilike(s.episodes.shootLocation, like))).limit(L);
    groups.push({ key: "episodes", label: "Épisodes", hits: eps.map((e) => ({ id: e.id, title: (e.number ? `Ép. ${String(e.number).padStart(2, "0")} — ` : "") + e.title, subtitle: EPISODE_STAGE[e.stage], href: `/production/${e.id}` })) });
    const cts = await db.select().from(s.contents).where(or(ilike(s.contents.title, like), ilike(s.contents.platform, like))).limit(L);
    groups.push({ key: "publications", label: "Publications & contenus", hits: cts.map((c) => ({ id: c.id, title: c.title, subtitle: `${CONTENT_KIND[c.kind]} · ${c.platform}`, href: c.episodeId ? `/production/${c.episodeId}#contenus` : `/contenus` })) });
    const drive = await db.select().from(s.episodes).where(and(ilike(s.episodes.title, like), sql`${s.episodes.driveFolderUrl} is not null`)).limit(L);
    const driveC = can(u, "crm.voir") ? await db.select().from(s.contacts).where(and(ilike(sql`${s.contacts.firstName} || ' ' || ${s.contacts.lastName}`, like), sql`${s.contacts.driveFolderUrl} is not null`)).limit(L) : [];
    const driveAtt = await db.select({ id: s.attachments.id, filename: s.attachments.filename, url: s.attachments.url }).from(s.attachments)
      .where(and(ilike(s.attachments.filename, like), sql`${s.attachments.url} like '%drive.google.com%' or ${s.attachments.url} like '%docs.google.com%'`)).limit(L);
    groups.push({ key: "drive", label: "Fichiers Drive associés", hits: [
      ...drive.map((e) => ({ id: e.id, title: `Dossier — ${e.title}`, subtitle: "Dossier Drive de l'épisode", href: e.driveFolderUrl!, external: true })),
      ...driveC.map((c) => ({ id: c.id, title: `Dossier — ${c.firstName} ${c.lastName}`, subtitle: "Dossier Drive de l'invité", href: c.driveFolderUrl!, external: true })),
      ...driveAtt.map((a) => ({ id: a.id, title: a.filename, subtitle: "Fichier Drive", href: a.url!, external: true })),
    ] });
  }
  if (can(u, "taches.voir")) {
    const rows = await db.select().from(s.tasks).where(or(ilike(s.tasks.title, like), ilike(s.tasks.description, like))).orderBy(desc(s.tasks.updatedAt)).limit(L);
    groups.push({ key: "taches", label: "Tâches", hits: rows.map((t) => ({ id: t.id, title: t.title, subtitle: `${TASK_STATUS[t.status]}${t.dueDate ? " · échéance " + formatDate(t.dueDate) : ""}`, href: `/missions?tache=${t.id}` })) });
  }
  {
    const docs = await db.select({ id: s.attachments.id, filename: s.attachments.filename, entityType: s.attachments.entityType, entityId: s.attachments.entityId })
      .from(s.attachments).where(ilike(s.attachments.filename, like)).limit(L);
    const res = can(u, "ressources.voir") ? await db.select().from(s.resources).where(and(
      or(ilike(s.resources.title, like), ilike(s.resources.description, like), ilike(s.resources.body, like)),
      can(u, "ressources.restreintes") ? undefined : sql`${s.resources.restricted} = false`)).limit(L) : [];
    const gd = can(u, "production.voir") ? await db.select().from(s.guestDocuments).where(ilike(s.guestDocuments.title, like)).limit(L) : [];
    const hrefFor = (t: string, id: string) => t === "task" ? `/missions?tache=${id}` : t === "contact" ? `/crm/${id}` : t === "episode" ? `/production/${id}` : t === "transaction" ? `/finances` : `/ressources`;
    groups.push({ key: "documents", label: "Documents", hits: [
      ...res.map((r) => ({ id: r.id, title: r.title, subtitle: "Ressource", href: `/ressources?r=${r.id}` })),
      ...gd.map((d) => ({ id: d.id, title: d.title, subtitle: "Document invité", href: `/crm/${d.contactId}#documents` })),
      ...docs.filter((d) => d.entityType !== "transaction" || can(u, "finances.voir")).map((d) => ({ id: d.id, title: d.filename, subtitle: "Pièce jointe", href: hrefFor(d.entityType, d.entityId) })),
    ] });
  }
  if (can(u, "finances.voir")) {
    const rows = await db.select().from(s.transactions).where(or(ilike(s.transactions.description, like), ilike(s.transactions.category, like))).orderBy(desc(s.transactions.date)).limit(L);
    groups.push({ key: "depenses", label: "Dépenses & recettes", hits: rows.map((t) => ({ id: t.id, title: t.description, subtitle: `${t.type === "depense" ? "−" : "+"}${euros(t.amountCents)} · ${formatDate(t.date)}`, href: `/finances?op=${t.id}` })) });
  }
  if (can(u, "idees.voir")) {
    const rows = await db.select().from(s.ideas).where(or(ilike(s.ideas.title, like), ilike(s.ideas.description, like))).orderBy(desc(s.ideas.day)).limit(L);
    groups.push({ key: "idees", label: "Idées", hits: rows.map((i) => ({ id: i.id, title: i.title, subtitle: formatDate(i.day), href: `/idees?idee=${i.id}` })) });
  }
  return groups.filter((g) => g.hits.length > 0);
}
