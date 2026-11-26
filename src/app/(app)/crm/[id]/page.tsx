import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { listAttachments, listUsers } from "@/lib/queries";
import { loadTasks } from "@/lib/task-queries";
import { loadGuestDocs } from "@/lib/guest-doc-queries";
import { driveStatus } from "@/lib/integrations/drive";
import { ContactDetail } from "./contact-detail";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("crm.voir");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await db.select().from(s.contacts).where(eq(s.contacts.id, id));
  if (!c) notFound();
  const [interactions, episodes, tasks, docs, files, users, drive] = await Promise.all([
    db.select({ i: s.contactInteractions, userName: s.users.name }).from(s.contactInteractions).leftJoin(s.users, eq(s.users.id, s.contactInteractions.userId)).where(eq(s.contactInteractions.contactId, id)).orderBy(desc(s.contactInteractions.occurredAt)),
    db.select().from(s.episodes).where(eq(s.episodes.contactId, id)),
    loadTasks(eq(s.tasks.contactId, id)),
    loadGuestDocs(eq(s.guestDocuments.contactId, id)),
    listAttachments("contact", id),
    listUsers(),
    driveStatus(),
  ]);
  const owner = users.find((u) => u.id === c.ownerId);
  return (
    <ContactDetail
      c={{ ...c, lastContactAt: c.lastContactAt?.toISOString() ?? null, archivedAt: c.archivedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), ownerName: owner?.name ?? null }}
      interactions={interactions.map(({ i, userName }) => ({ id: i.id, type: i.type, subject: i.subject, body: i.body, occurredAt: i.occurredAt.toISOString(), userName }))}
      episodes={episodes.map((e) => ({ id: e.id, title: e.title, number: e.number, stage: e.stage }))}
      tasks={tasks} docs={docs} files={files}
      users={users.map((u) => ({ id: u.id, label: u.name }))}
      perms={{ edit: can(user, "crm.modifier"), del: can(user, "crm.supprimer"), production: can(user, "production.modifier"), tasks: can(user, "taches.modifier") }}
      driveConnected={drive.connected}
      meId={user.id}
    />
  );
}
