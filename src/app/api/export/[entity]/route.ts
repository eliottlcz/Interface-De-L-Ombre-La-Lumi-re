import { desc, eq, sql, aliasedTable } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { toCSV, toXLSX, type Column } from "@/lib/export";
import { CONTACT_CATEGORY, CONTENT_KIND, CONTENT_STATUS, EPISODE_STAGE, PRIORITY, TASK_STATUS, TX_CATEGORIES } from "@/lib/labels";
import { formatDate, todayISO } from "@/lib/dates";

/** Exports CSV / Excel. Les secrets (coffre-fort, jetons) ne sont JAMAIS exportés par cette route. */
type Spec = { perm: Permission; sheet: string; load: () => Promise<{ rows: unknown[]; cols: Column<never>[] }> };
const iso = (d: Date | string | null | undefined) => (d ? (typeof d === "string" ? d : d.toISOString().slice(0, 10)) : "");

const SPECS: Record<string, Spec> = {
  contacts: { perm: "crm.voir", sheet: "Contacts", load: async () => {
    const rows = await db.select({ c: s.contacts, owner: s.users.name }).from(s.contacts).leftJoin(s.users, eq(s.users.id, s.contacts.ownerId)).orderBy(s.contacts.lastName);
    type R = (typeof rows)[number];
    const cols: Column<R>[] = [
      { header: "Prénom", value: (r) => r.c.firstName }, { header: "Nom", value: (r) => r.c.lastName }, { header: "Profession", value: (r) => r.c.profession, width: 28 },
      { header: "Entreprise", value: (r) => r.c.company }, { header: "E-mail", value: (r) => r.c.email, width: 30 }, { header: "Téléphone", value: (r) => r.c.phone },
      { header: "Catégorie", value: (r) => CONTACT_CATEGORY[r.c.category] }, { header: "Priorité", value: (r) => PRIORITY[r.c.priority] }, { header: "Responsable", value: (r) => r.owner },
      { header: "Instagram", value: (r) => r.c.socials?.instagram }, { header: "TikTok", value: (r) => r.c.socials?.tiktok }, { header: "LinkedIn", value: (r) => r.c.socials?.linkedin },
      { header: "Dernier contact", value: (r) => iso(r.c.lastContactAt) }, { header: "Relances", value: (r) => r.c.followupCount }, { header: "Prochaine relance", value: (r) => r.c.nextFollowupAt },
      { header: "Tournage", value: (r) => r.c.shootDate }, { header: "Publication", value: (r) => r.c.publishDate }, { header: "Lien épisode", value: (r) => r.c.episodeUrl },
      { header: "Pourquoi", value: (r) => r.c.whyInteresting, width: 40 }, { header: "Notes", value: (r) => r.c.notes, width: 40 }, { header: "Archivé", value: (r) => (r.c.archivedAt ? "oui" : "") },
    ];
    return { rows, cols: cols as Column<never>[] };
  } },
  taches: { perm: "taches.voir", sheet: "Tâches", load: async () => {
    const creator = aliasedTable(s.users, "creator");
    const rows = await db.select({ t: s.tasks, who: s.users.name, by: creator.name, ep: s.episodes.title }).from(s.tasks).leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId)).leftJoin(creator, eq(creator.id, s.tasks.createdBy)).leftJoin(s.episodes, eq(s.episodes.id, s.tasks.episodeId)).orderBy(desc(s.tasks.createdAt));
    type R = (typeof rows)[number];
    const cols: Column<R>[] = [
      { header: "Titre", value: (r) => r.t.title, width: 44 }, { header: "Description", value: (r) => r.t.description, width: 40 }, { header: "Responsable", value: (r) => r.who ?? "Commune" },
      { header: "Créée par", value: (r) => r.by }, { header: "Priorité", value: (r) => PRIORITY[r.t.priority] }, { header: "Statut", value: (r) => TASK_STATUS[r.t.status] },
      { header: "Créée le", value: (r) => iso(r.t.createdAt) }, { header: "Échéance", value: (r) => r.t.dueDate }, { header: "Terminée le", value: (r) => iso(r.t.completedAt) }, { header: "Épisode", value: (r) => r.ep },
    ];
    return { rows, cols: cols as Column<never>[] };
  } },
  finances: { perm: "finances.voir", sheet: "Finances", load: async () => {
    const rows = await db.select({ t: s.transactions, who: s.users.name, ep: s.episodes.title }).from(s.transactions).leftJoin(s.users, eq(s.users.id, s.transactions.ownerId)).leftJoin(s.episodes, eq(s.episodes.id, s.transactions.episodeId)).orderBy(desc(s.transactions.date));
    type R = (typeof rows)[number];
    const cols: Column<R>[] = [
      { header: "Date", value: (r) => r.t.date }, { header: "Type", value: (r) => (r.t.type === "depense" ? "Dépense" : "Recette") },
      { header: "Montant (€)", value: (r) => r.t.amountCents / 100 }, { header: "Montant signé (€)", value: (r) => (r.t.type === "depense" ? -1 : 1) * r.t.amountCents / 100 },
      { header: "Catégorie", value: (r) => TX_CATEGORIES[r.t.category as keyof typeof TX_CATEGORIES] ?? r.t.category, width: 26 }, { header: "Description", value: (r) => r.t.description, width: 40 },
      { header: "Responsable", value: (r) => r.who }, { header: "Épisode", value: (r) => r.ep }, { header: "Statut", value: (r) => (r.t.status === "regle" ? "Réglé" : "À régler") }, { header: "Échéance", value: (r) => r.t.dueDate },
      { header: "Justificatifs", value: () => "" },
    ];
    const counts = await db.select({ id: s.attachments.entityId, n: sql<number>`count(*)::int` }).from(s.attachments).where(eq(s.attachments.entityType, "transaction")).groupBy(s.attachments.entityId);
    const m = new Map(counts.map((c) => [c.id, c.n]));
    cols[cols.length - 1] = { header: "Justificatifs", value: (r) => m.get(r.t.id) ?? 0 };
    return { rows, cols: cols as Column<never>[] };
  } },
  production: { perm: "production.voir", sheet: "Production", load: async () => {
    const rows = await db.select({ e: s.episodes, who: s.users.name, guest: sql<string | null>`trim(${s.contacts.firstName} || ' ' || ${s.contacts.lastName})` }).from(s.episodes).leftJoin(s.users, eq(s.users.id, s.episodes.producerId)).leftJoin(s.contacts, eq(s.contacts.id, s.episodes.contactId)).orderBy(s.episodes.number);
    const contents = await db.select().from(s.contents);
    type R = (typeof rows)[number];
    const cols: Column<R>[] = [
      { header: "N°", value: (r) => r.e.number }, { header: "Titre", value: (r) => r.e.title, width: 36 }, { header: "Invité", value: (r) => r.guest }, { header: "Étape", value: (r) => EPISODE_STAGE[r.e.stage], width: 26 },
      { header: "Responsable", value: (r) => r.who }, { header: "Tournage", value: (r) => (r.e.shootDate ? formatDate(r.e.shootDate) : "") }, { header: "Lieu", value: (r) => r.e.shootLocation },
      { header: "Publication prévue", value: (r) => r.e.plannedPublishDate }, { header: "Publié le", value: (r) => iso(r.e.publishedAt) },
      { header: "YouTube", value: (r) => r.e.publicationLinks?.youtube }, { header: "Spotify", value: (r) => r.e.publicationLinks?.spotify }, { header: "Dossier Drive", value: (r) => r.e.driveFolderUrl },
      { header: "Déclinaisons publiées", value: (r) => contents.filter((c) => c.episodeId === r.e.id && c.status === "publie").map((c) => CONTENT_KIND[c.kind]).join(", "), width: 40 },
      { header: "Déclinaisons en cours", value: (r) => contents.filter((c) => c.episodeId === r.e.id && c.status !== "publie").map((c) => `${CONTENT_KIND[c.kind]} (${CONTENT_STATUS[c.status]})`).join(", "), width: 50 },
    ];
    return { rows, cols: cols as Column<never>[] };
  } },
};

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const spec = SPECS[entity];
  if (!spec) return new Response("Export inconnu", { status: 404 });
  const u = await getCurrentUser();
  if (!u) return new Response("Non authentifié", { status: 401 });
  if (!can(u, spec.perm) || (!can(u, "exports.faire") && entity !== "taches")) return new Response("Accès refusé", { status: 403 });
  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const { rows, cols } = await spec.load();
  const name = `dlal-${entity}-${todayISO()}.${format}`;
  await audit({ userId: u.id, action: "export", summary: `Export ${entity} (${format}, ${rows.length} lignes)`, sensitive: true });
  const body = format === "xlsx" ? new Uint8Array(await toXLSX(spec.sheet, rows as never[], cols)) : toCSV(rows as never[], cols);
  return new Response(body, { headers: {
    "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store",
  } });
}
