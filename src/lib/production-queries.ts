import "server-only";
import { asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import type { ChecklistView } from "@/components/production/checklist-card";
import type { ContentView } from "@/components/production/contents";

export async function loadChecklists(where?: SQL): Promise<ChecklistView[]> {
  const lists = await db.select({ c: s.checklists, episodeTitle: s.episodes.title }).from(s.checklists).leftJoin(s.episodes, eq(s.episodes.id, s.checklists.episodeId)).where(where).orderBy(desc(s.checklists.isTemplate), asc(s.checklists.phase), desc(s.checklists.createdAt));
  if (!lists.length) return [];
  const items = await db.select({ i: s.checklistItems, doneByName: s.users.name }).from(s.checklistItems).leftJoin(s.users, eq(s.users.id, s.checklistItems.doneBy))
    .where(inArray(s.checklistItems.checklistId, lists.map((l) => l.c.id))).orderBy(asc(s.checklistItems.position));
  return lists.map(({ c, episodeTitle }) => ({
    id: c.id, name: c.name, phase: c.phase, isTemplate: c.isTemplate, episodeId: c.episodeId, episodeTitle,
    items: items.filter((x) => x.i.checklistId === c.id).map((x) => ({ id: x.i.id, label: x.i.label, done: x.i.done, doneByName: x.doneByName })),
  }));
}

export async function loadContents(where?: SQL): Promise<ContentView[]> {
  const rows = await db.select({ c: s.contents, ownerName: s.users.name, episodeTitle: s.episodes.title }).from(s.contents)
    .leftJoin(s.users, eq(s.users.id, s.contents.ownerId)).leftJoin(s.episodes, eq(s.episodes.id, s.contents.episodeId))
    .where(where).orderBy(sql`${s.contents.plannedDate} asc nulls last`, asc(s.contents.kind));
  return rows.map(({ c, ownerName, episodeTitle }) => ({
    id: c.id, episodeId: c.episodeId, episodeTitle, kind: c.kind, title: c.title, platform: c.platform, ownerId: c.ownerId, ownerName,
    status: c.status, plannedDate: c.plannedDate, fileUrl: c.fileUrl, publicationUrl: c.publicationUrl,
  }));
}
