"use server";
import { z } from "zod";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { createSession, destroySession, clientInfo, getCurrentUser } from "@/lib/auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { appUrl, mailLayout, sendMail } from "@/lib/mail";

export type FormState = { error?: string; message?: string } | undefined;

const MAX_FAILS_EMAIL = 5;
const MAX_FAILS_IP = 25;
const WINDOW_MIN = 15;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Renseignez votre e-mail et votre mot de passe." };
  const { ip, userAgent } = await clientInfo();
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);

  const [{ n: failsEmail }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.loginEvents)
    .where(and(eq(schema.loginEvents.email, email), eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, since)));
  const [{ n: failsIp }] = ip ? await db.select({ n: sql<number>`count(*)::int` }).from(schema.loginEvents)
    .where(and(eq(schema.loginEvents.ip, ip), eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, since))) : [{ n: 0 }];
  if (failsEmail >= MAX_FAILS_EMAIL || failsIp >= MAX_FAILS_IP) {
    await db.insert(schema.loginEvents).values({ email, success: false, ip, userAgent, reason: "bloque_trop_de_tentatives" });
    return { error: `Trop de tentatives. Réessayez dans ${WINDOW_MIN} minutes.` };
  }

  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok || !user.active) {
    await db.insert(schema.loginEvents).values({ email, userId: user?.id, success: false, ip, userAgent, reason: !user ? "inconnu" : !user.active ? "desactive" : "mot_de_passe" });
    return { error: "Identifiants incorrects." };
  }
  await db.insert(schema.loginEvents).values({ email, userId: user.id, success: true, ip, userAgent });
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession(user.id);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  const u = await getCurrentUser();
  await destroySession();
  if (u) await audit({ userId: u.id, action: "auth.deconnexion", summary: `${u.name} s'est déconnecté(e)` });
  redirect("/connexion");
}

/** Demande de réinitialisation : réponse identique que le compte existe ou non. */
export async function requestResetAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const generic = { message: "Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé. Sans e-mail configuré, demandez le lien à un administrateur (Paramètres → Utilisateurs)." };
  if (!z.email().safeParse(email).success) return { error: "Adresse e-mail invalide." };
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (!user || !user.active) return generic;
  const { link } = await createResetToken(user.id, user.email, null);
  await sendMail(user.email, "Réinitialisation de votre mot de passe", mailLayout(
    "Réinitialiser votre mot de passe", "Ce lien est valable une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    { label: "Choisir un nouveau mot de passe", url: link }));
  await audit({ userId: user.id, action: "auth.demande_reinitialisation", summary: `Demande de réinitialisation pour ${user.email}`, sensitive: true });
  return generic;
}

export async function createResetToken(userId: string, email: string, createdBy: string | null) {
  const token = randomToken(32);
  // Invalide les anciens liens non utilisés
  await db.update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, userId), eq(schema.authTokens.type, "reinitialisation"), isNull(schema.authTokens.usedAt)));
  await db.insert(schema.authTokens).values({
    type: "reinitialisation", email, userId, tokenHash: sha256(token), createdBy,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  return { link: appUrl(`/lien/${token}`) };
}

async function findToken(token: string) {
  const [t] = await db.select().from(schema.authTokens)
    .where(and(eq(schema.authTokens.tokenHash, sha256(token)), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, new Date()))).limit(1);
  return t ?? null;
}
export async function describeToken(token: string) {
  const t = await findToken(token);
  return t ? { type: t.type, email: t.email, name: t.name } : null;
}

/** Utilisation d'un lien : invitation (création du compte) ou réinitialisation. */
export async function consumeTokenAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const t = await findToken(token);
  if (!t) return { error: "Ce lien est invalide ou a expiré. Demandez-en un nouveau." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };
  const passwordHash = await hashPassword(password);

  let userId: string;
  if (t.type === "invitation") {
    const name = String(form.get("name") ?? "").trim() || t.name || t.email;
    const existing = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${t.email.toLowerCase()}`).limit(1);
    if (existing[0]) return { error: "Un compte existe déjà pour cette adresse." };
    const [u] = await db.insert(schema.users).values({ email: t.email.toLowerCase(), name, role: t.role ?? "collaborateur", passwordHash }).returning();
    userId = u.id;
    await audit({ userId, action: "utilisateur.invitation_acceptee", entityType: "user", entityId: userId, summary: `${name} a rejoint l'équipe (${t.role})`, sensitive: true });
  } else {
    userId = t.userId!;
    await db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    // Déconnecte toutes les sessions existantes après changement de mot de passe
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await audit({ userId, action: "auth.mot_de_passe_reinitialise", entityType: "user", entityId: userId, summary: "Mot de passe réinitialisé", sensitive: true });
  }
  await db.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, t.id));
  await createSession(userId);
  redirect("/");
}
