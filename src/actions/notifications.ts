"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";

export async function markNotificationsRead(ids?: string[]) {
  const u = await assertUser();
  const where = ids?.length
    ? and(eq(schema.notifications.userId, u.id), inArray(schema.notifications.id, ids))
    : and(eq(schema.notifications.userId, u.id), isNull(schema.notifications.readAt));
  await db.update(schema.notifications).set({ readAt: new Date() }).where(where);
  return { ok: true as const };
}
