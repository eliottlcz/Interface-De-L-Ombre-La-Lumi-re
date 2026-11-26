import "server-only";
import { aliasedTable, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import type { TaskView } from "@/components/tasks/task-card";

export async function loadTasks(where?: SQL): Promise<TaskView[]> {
  const creator = aliasedTable(s.users, "creator");
  const rows = await db.select({
    t: s.tasks, assigneeName: s.users.name, createdByName: creator.name,
    contactName: sql<string | null>`nullif(trim(${s.contacts.firstName} || ' ' || ${s.contacts.lastName}), '')`,
    episodeTitle: s.episodes.title,
    comments: sql<number>`(select count(*)::int from task_comments c where c.task_id = ${s.tasks.id})`,
    files: sql<number>`(select count(*)::int from attachments a where a.entity_type = 'task' and a.entity_id = ${s.tasks.id})`,
  }).from(s.tasks)
    .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
    .leftJoin(creator, eq(creator.id, s.tasks.createdBy))
    .leftJoin(s.contacts, eq(s.contacts.id, s.tasks.contactId))
    .leftJoin(s.episodes, eq(s.episodes.id, s.tasks.episodeId))
    .where(where).orderBy(desc(s.tasks.updatedAt)).limit(2000);
  return rows.map((r) => ({
    id: r.t.id, title: r.t.title, description: r.t.description, status: r.t.status, priority: r.t.priority, dueDate: r.t.dueDate,
    completedAt: r.t.completedAt?.toISOString() ?? null, createdAt: r.t.createdAt.toISOString(),
    assigneeId: r.t.assigneeId, assigneeName: r.assigneeName, createdById: r.t.createdBy, createdByName: r.createdByName,
    contactId: r.t.contactId, contactName: r.contactName, episodeId: r.t.episodeId, episodeTitle: r.episodeTitle,
    comments: r.comments, files: r.files,
  }));
}
export async function loadTaskComments(taskId: string) {
  const rows = await db.select({ id: s.taskComments.id, body: s.taskComments.body, createdAt: s.taskComments.createdAt, userName: s.users.name })
    .from(s.taskComments).leftJoin(s.users, eq(s.users.id, s.taskComments.userId)).where(eq(s.taskComments.taskId, taskId)).orderBy(s.taskComments.createdAt);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
