import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { clientInfo, createSession } from "./session";
import { verifyPassword } from "./password";

const MAX_FAILS_EMAIL = 5;
const MAX_FAILS_IP = 25;
const WINDOW_MIN = 15;

export type LoginResult = { ok: true } | { ok: false; error: string };

/** Vérifie l'identité, applique la limite de tentatives, journalise et ouvre la session (cookie posé par createSession). */
export async function attemptLogin(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: "Renseignez votre e-mail et votre mot de passe." };
  const { ip, userAgent } = await clientInfo();
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);

  const [{ n: failsEmail }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.loginEvents)
    .where(and(eq(schema.loginEvents.email, email), eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, since)));
  const [{ n: failsIp }] = ip ? await db.select({ n: sql<number>`count(*)::int` }).from(schema.loginEvents)
    .where(and(eq(schema.loginEvents.ip, ip), eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, since))) : [{ n: 0 }];
  if (failsEmail >= MAX_FAILS_EMAIL || failsIp >= MAX_FAILS_IP) {
    await db.insert(schema.loginEvents).values({ email, success: false, ip, userAgent, reason: "bloque_trop_de_tentatives" });
    return { ok: false, error: `Trop de tentatives. Réessayez dans ${WINDOW_MIN} minutes.` };
  }

  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok || !user.active) {
    await db.insert(schema.loginEvents).values({ email, userId: user?.id, success: false, ip, userAgent, reason: !user ? "inconnu" : !user.active ? "desactive" : "mot_de_passe" });
    return { ok: false, error: "Identifiants incorrects — la porte du QG reste fermée." };
  }
  await db.insert(schema.loginEvents).values({ email, userId: user.id, success: true, ip, userAgent });
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession(user.id);
  return { ok: true };
}
