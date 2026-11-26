import "server-only";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import type { GuestDocView } from "@/components/crm/guest-docs";

export async function loadGuestDocs(where?: SQL): Promise<GuestDocView[]> {
  const rows = await db.select({
    d: s.guestDocuments, contactName: sql<string>`trim(${s.contacts.firstName} || ' ' || ${s.contacts.lastName})`,
    episodeTitle: s.episodes.title, validatedByName: s.users.name,
  }).from(s.guestDocuments)
    .innerJoin(s.contacts, eq(s.contacts.id, s.guestDocuments.contactId))
    .leftJoin(s.episodes, eq(s.episodes.id, s.guestDocuments.episodeId))
    .leftJoin(s.users, eq(s.users.id, s.guestDocuments.validatedBy))
    .where(where).orderBy(desc(s.guestDocuments.updatedAt));
  return rows.map(({ d, contactName, episodeTitle, validatedByName }) => ({
    id: d.id, contactId: d.contactId, contactName, episodeId: d.episodeId, episodeTitle, kind: d.kind, title: d.title, status: d.status,
    proofAttachmentId: d.proofAttachmentId, proofUrl: d.proofUrl, receivedAt: d.receivedAt?.toISOString() ?? null,
    validatedAt: d.validatedAt?.toISOString() ?? null, validatedByName,
  }));
}
