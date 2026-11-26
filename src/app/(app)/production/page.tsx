import { desc, eq, sql } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { listContactOptions, listUsers } from "@/lib/queries";
import { ProductionView, type EpisodeRow } from "./production-view";

export const metadata = { title: "Production" };

export default async function ProductionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("production.voir");
  const sp = await searchParams;
  const [rows, users, contacts] = await Promise.all([
    db.select({
      e: s.episodes, producerName: s.users.name,
      guest: sql<string | null>`nullif(trim(${s.contacts.firstName} || ' ' || ${s.contacts.lastName}), '')`, profession: s.contacts.profession,
      openTasks: sql<number>`(select count(*)::int from tasks t where t.episode_id = ${s.episodes.id} and t.status <> 'termine')`,
      contents: sql<number>`(select count(*)::int from contents c where c.episode_id = ${s.episodes.id})`,
      missingDocs: sql<number>`(select count(*)::int from guest_documents g where g.episode_id = ${s.episodes.id} and g.status <> 'valide')`,
    }).from(s.episodes).leftJoin(s.users, eq(s.users.id, s.episodes.producerId)).leftJoin(s.contacts, eq(s.contacts.id, s.episodes.contactId))
      .orderBy(desc(s.episodes.updatedAt)),
    listUsers(), listContactOptions(),
  ]);
  const episodes: EpisodeRow[] = rows.map((r) => ({
    id: r.e.id, number: r.e.number, title: r.e.title, stage: r.e.stage, guest: r.guest, profession: r.profession, producerId: r.e.producerId, producerName: r.producerName,
    shootDate: r.e.shootDate?.toISOString() ?? null, plannedPublishDate: r.e.plannedPublishDate, publishedAt: r.e.publishedAt?.toISOString() ?? null,
    archived: Boolean(r.e.archivedAt), openTasks: r.openTasks, contents: r.contents, missingDocs: r.missingDocs,
  }));
  return <ProductionView episodes={episodes} users={users.map((u) => ({ id: u.id, label: u.name }))} contacts={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))}
    meId={user.id} canEdit={can(user, "production.modifier")} initialCreate={sp.nouveau === "1"} />;
}
