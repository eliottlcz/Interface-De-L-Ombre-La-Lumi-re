import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { listAttachments, listContactOptions, listUsers, listEpisodeOptions, episodeLabel } from "@/lib/queries";
import { loadTasks } from "@/lib/task-queries";
import { loadGuestDocs } from "@/lib/guest-doc-queries";
import { loadChecklists, loadContents } from "@/lib/production-queries";
import { driveStatus } from "@/lib/integrations/drive";
import { utcToParis } from "@/lib/dates";
import { EpisodeDetail } from "./episode-detail";

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("production.voir");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e] = await db.select().from(s.episodes).where(eq(s.episodes.id, id));
  if (!e) notFound();
  const [guest] = e.contactId ? await db.select().from(s.contacts).where(eq(s.contacts.id, e.contactId)) : [];
  const [stages, tasks, docs, checklists, contents, files, users, contacts, events, drive, episodes] = await Promise.all([
    db.select({ st: s.episodeStages, by: s.users.name }).from(s.episodeStages).leftJoin(s.users, eq(s.users.id, s.episodeStages.completedBy)).where(eq(s.episodeStages.episodeId, id)),
    loadTasks(eq(s.tasks.episodeId, id)),
    loadGuestDocs(eq(s.guestDocuments.episodeId, id)),
    loadChecklists(eq(s.checklists.episodeId, id)),
    loadContents(eq(s.contents.episodeId, id)),
    listAttachments("episode", id),
    listUsers(), listContactOptions(),
    db.select().from(s.events).where(eq(s.events.episodeId, id)).orderBy(asc(s.events.startsAt)),
    driveStatus(), listEpisodeOptions(),
  ]);
  const shoot = e.shootDate ? utcToParis(e.shootDate) : null;
  return (
    <EpisodeDetail
      e={{
        id: e.id, number: e.number, title: e.title, stage: e.stage, contactId: e.contactId, producerId: e.producerId,
        producerName: users.find((u) => u.id === e.producerId)?.name ?? null,
        shootDay: shoot?.date ?? "", shootTime: shoot?.time ?? "10:00", shootLocation: e.shootLocation ?? "", prepNotes: e.prepNotes ?? "", interviewQuestions: e.interviewQuestions ?? "",
        videoUrl: e.videoUrl ?? "", audioUrl: e.audioUrl ?? "", graphicsUrl: e.graphicsUrl ?? "", adminDocsUrl: e.adminDocsUrl ?? "", plannedPublishDate: e.plannedPublishDate ?? "",
        publicationLinks: e.publicationLinks ?? {}, driveFolderUrl: e.driveFolderUrl ?? "", driveFolderId: e.driveFolderId, publishedAt: e.publishedAt?.toISOString() ?? null, archived: Boolean(e.archivedAt),
      }}
      guest={guest ? { id: guest.id, name: `${guest.firstName} ${guest.lastName}`.trim(), profession: guest.profession } : null}
      stages={stages.map(({ st, by }) => ({ stage: st.stage, at: st.completedAt.toISOString(), by }))}
      tasks={tasks} docs={docs} checklists={checklists} contents={contents} files={files}
      events={events.map((ev) => ({ id: ev.id, title: ev.title, type: ev.type, startsAt: ev.startsAt.toISOString() }))}
      users={users.map((u) => ({ id: u.id, label: u.name }))}
      contacts={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))}
      episodes={episodes.map((x) => ({ id: x.id, label: episodeLabel(x) }))}
      driveConnected={drive.connected}
      perms={{ edit: can(user, "production.modifier"), del: can(user, "production.supprimer"), tasks: can(user, "taches.modifier") }}
    />
  );
}
