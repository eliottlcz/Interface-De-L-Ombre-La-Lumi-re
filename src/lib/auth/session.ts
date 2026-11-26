import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { can, effectivePermissions, type Permission, type Role } from "./permissions";

export const SESSION_COOKIE = "dlal_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: string; email: string; name: string; title: string | null; role: Role;
  permissionOverrides: Record<string, boolean>;
  permissions: Permission[];
};

export class AuthError extends Error {
  constructor(message = "Accès refusé", public status = 403) { super(message); }
}

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const { ip, userAgent } = await clientInfo();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(schema.sessions).values({ userId, tokenHash: sha256(token), expiresAt, ip, userAgent });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Utilisateur connecté (ou null). Mis en cache le temps d'une requête. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ s: schema.sessions, u: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.u.active) return null;
  // Rafraîchit l'activité au plus une fois toutes les 10 minutes
  if (Date.now() - row.s.lastSeenAt.getTime() > 10 * 60_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, row.s.id));
  }
  const u = row.u;
  return {
    id: u.id, email: u.email, name: u.name, title: u.title, role: u.role,
    permissionOverrides: u.permissionOverrides ?? {},
    permissions: [...effectivePermissions(u)],
  };
});

/** Pour les pages : redirige vers la connexion si non connecté. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/connexion");
  return u;
}

/** Pour les pages : renvoie vers l'accueil si la permission manque. */
export async function requirePagePermission(p: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u, p)) redirect("/?refus=" + encodeURIComponent(p));
  return u;
}

/** Pour les actions serveur / routes API : lève une erreur si non autorisé. */
export async function assertPermission(p: Permission): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("Session expirée, reconnectez-vous.", 401);
  if (!can(u, p)) throw new AuthError("Vous n'avez pas la permission nécessaire.");
  return u;
}

export async function assertUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("Session expirée, reconnectez-vous.", 401);
  return u;
}
