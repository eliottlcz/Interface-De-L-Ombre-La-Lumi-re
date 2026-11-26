import "server-only";
import { asc, eq, and, desc } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";

export type UserOption = { id: string; name: string };
export async function listUsers(): Promise<UserOption[]> {
  return db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.active, true)).orderBy(asc(s.users.name));
}
export async function listEpisodeOptions() {
  return db.select({ id: s.episodes.id, title: s.episodes.title, number: s.episodes.number }).from(s.episodes).orderBy(desc(s.episodes.createdAt));
}
export async function listContactOptions() {
  return db.select({ id: s.contacts.id, firstName: s.contacts.firstName, lastName: s.contacts.lastName }).from(s.contacts).orderBy(asc(s.contacts.firstName));
}
export type AttachmentView = { id: string; filename: string; mimeType: string | null; size: number | null; url: string | null; hasFile: boolean; createdAt: string; uploadedBy: string | null };
export async function listAttachments(entityType: string, entityId: string): Promise<AttachmentView[]> {
  const rows = await db.select({
    id: s.attachments.id, filename: s.attachments.filename, mimeType: s.attachments.mimeType, size: s.attachments.size, url: s.attachments.url,
    createdAt: s.attachments.createdAt, uploadedBy: s.users.name,
  }).from(s.attachments).leftJoin(s.users, eq(s.users.id, s.attachments.uploadedBy))
    .where(and(eq(s.attachments.entityType, entityType), eq(s.attachments.entityId, entityId))).orderBy(desc(s.attachments.createdAt));
  return rows.map((r) => ({ ...r, hasFile: !r.url, createdAt: r.createdAt.toISOString() }));
}
export const episodeLabel = (e: { number: number | null; title: string }) => (e.number ? `Ép. ${String(e.number).padStart(2, "0")} — ` : "") + e.title;
