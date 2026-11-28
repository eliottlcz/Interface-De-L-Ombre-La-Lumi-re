import { NextResponse } from "next/server";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { countUrgent, getReminders } from "@/lib/reminders";
import { loadTasks } from "@/lib/task-queries";
import { crossPlatform, internalCounts } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** Diagnostic réservé aux administrateurs connectés : durée de chaque étape de construction d'une page. Aucune donnée renvoyée. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "utilisateurs.gerer")) return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  const out: Record<string, string> = { node: process.version, region: process.env.VERCEL_REGION ?? "locale", memoire_mo: String(Math.round(process.memoryUsage().rss / 1048576)) };
  const etape = async (nom: string, f: () => Promise<unknown>) => {
    const t = Date.now();
    try { const r = await Promise.race([f(), new Promise((_, rej) => setTimeout(() => rej(new Error("bloquée > 8 s")), 8000))]); out[nom] = `ok ${Date.now() - t} ms${Array.isArray(r) ? ` (${r.length} lignes)` : ""}`; }
    catch (e) { out[nom] = `ERREUR ${(e as Error).message.slice(0, 140)} (${Date.now() - t} ms)`; }
  };
  await etape("layout_notifications", () => db.select().from(s.notifications).where(eq(s.notifications.userId, user.id)).orderBy(desc(s.notifications.createdAt)).limit(20));
  await etape("layout_non_lues", () => db.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt))));
  await etape("layout_urgents", () => countUrgent(user));
  await etape("rappels", () => getReminders(user));
  await etape("mes_taches", () => loadTasks(and(eq(s.tasks.assigneeId, user.id), ne(s.tasks.status, "termine"))));
  await etape("compteurs", () => internalCounts());
  await etape("abonnes", () => crossPlatform("abonnes"));
  await etape("journal", () => db.select({ a: s.auditLog, name: s.users.name }).from(s.auditLog).innerJoin(s.users, eq(s.users.id, s.auditLog.userId)).where(and(ne(s.auditLog.userId, user.id), eq(s.auditLog.sensitive, false))).orderBy(desc(s.auditLog.createdAt)).limit(8));
  await etape("episodes", () => db.select({ id: s.episodes.id }).from(s.episodes));
  await etape("concurrence_8_requetes", () => Promise.all(Array.from({ length: 8 }, () => db.execute(sql`select pg_sleep(0.05)`))));
  await etape("concurrence_20_requetes", () => Promise.all(Array.from({ length: 20 }, () => db.execute(sql`select pg_sleep(0.02)`))));
  await etape("layout_en_parallele", () => Promise.all([
    db.select().from(s.notifications).where(eq(s.notifications.userId, user.id)).orderBy(desc(s.notifications.createdAt)).limit(20),
    db.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt))),
    countUrgent(user),
  ]));
  await etape("accueil_en_parallele", () => Promise.all([
    getReminders(user), loadTasks(and(eq(s.tasks.assigneeId, user.id), ne(s.tasks.status, "termine"))), internalCounts(), crossPlatform("abonnes"), crossPlatform("vues"),
    db.select({ id: s.episodes.id }).from(s.episodes), db.select().from(s.ideas).limit(2),
  ]));
  await etape("layout_et_accueil_ensemble", () => Promise.all([countUrgent(user), getReminders(user), loadTasks(), internalCounts(), crossPlatform("abonnes"), crossPlatform("vues")]));
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
