import "server-only";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function notify(opts: {
  userIds: (string | null | undefined)[]; type: string; title: string; body?: string; link?: string;
  actorId?: string | null; dedupeKey?: string; includeActor?: boolean;
}) {
  const ids = [...new Set(opts.userIds.filter(Boolean) as string[])].filter((id) => opts.includeActor || id !== opts.actorId);
  if (!ids.length) return;
  await db.insert(schema.notifications).values(ids.map((userId) => ({
    userId, type: opts.type, title: opts.title, body: opts.body, link: opts.link,
    actorId: opts.actorId ?? null, dedupeKey: opts.dedupeKey,
  }))).onConflictDoNothing();
}

/** Notifie tous les utilisateurs actifs (sauf l'auteur). */
export async function notifyAll(opts: Omit<Parameters<typeof notify>[0], "userIds">) {
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.active, true));
  await notify({ ...opts, userIds: users.map((u) => u.id) });
}
