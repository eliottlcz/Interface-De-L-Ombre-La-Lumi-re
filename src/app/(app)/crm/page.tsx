import { desc, eq, sql } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { listUsers } from "@/lib/queries";
import { CrmView, type ContactRow } from "./crm-view";

export const metadata = { title: "Invités & CRM" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("crm.voir");
  const sp = await searchParams;
  const [rows, users] = await Promise.all([
    db.select({
      c: s.contacts, ownerName: s.users.name,
      episodeId: sql<string | null>`(select e.id from episodes e where e.contact_id = ${s.contacts.id} order by e.created_at desc limit 1)`,
    }).from(s.contacts).leftJoin(s.users, eq(s.users.id, s.contacts.ownerId)).orderBy(desc(s.contacts.updatedAt)),
    listUsers(),
  ]);
  const contacts: ContactRow[] = rows.map(({ c, ownerName, episodeId }) => ({
    id: c.id, firstName: c.firstName, lastName: c.lastName, profession: c.profession, company: c.company, email: c.email, phone: c.phone,
    socials: c.socials, category: c.category, priority: c.priority, ownerId: c.ownerId, ownerName, whyInteresting: c.whyInteresting,
    lastContactAt: c.lastContactAt?.toISOString() ?? null, lastEmailSubject: c.lastEmailSubject, responseReceived: c.responseReceived,
    followupCount: c.followupCount, nextAction: c.nextAction, nextFollowupAt: c.nextFollowupAt, shootDate: c.shootDate, publishDate: c.publishDate,
    episodeUrl: c.episodeUrl, archived: Boolean(c.archivedAt), episodeId, updatedAt: c.updatedAt.toISOString(),
  }));
  return <CrmView contacts={contacts} users={users.map((u) => ({ id: u.id, label: u.name }))} meId={user.id} canEdit={can(user, "crm.modifier")} initialCreate={sp.nouveau === "1"} initialQuery={sp.q ?? ""} />;
}
