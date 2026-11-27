"use server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission, assertUser, SESSION_COOKIE } from "@/lib/auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { randomToken, sha256 } from "@/lib/crypto";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { appUrl, isMailConfigured, mailLayout, sendMail } from "@/lib/mail";
import { createResetToken } from "@/actions/auth";
import { cookies } from "next/headers";

const Role = z.enum(["administrateur", "producteur", "collaborateur", "lecteur"]);

export async function inviteUser(input: { email: string; name: string; role: string }) {
  return run(async () => {
    const u = await assertPermission("utilisateurs.gerer");
    const email = z.email({ message: "Adresse e-mail invalide" }).parse(input.email.trim().toLowerCase());
    const role = Role.parse(input.role);
    const name = z.string().trim().min(1, "Nom obligatoire").max(120).parse(input.name);
    const exists = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${email}`);
    if (exists.length) userError("Un compte existe déjà pour cette adresse.");
    await db.update(s.authTokens).set({ usedAt: new Date() }).where(and(eq(s.authTokens.email, email), eq(s.authTokens.type, "invitation"), isNull(s.authTokens.usedAt)));
    const token = randomToken(32);
    await db.insert(s.authTokens).values({ type: "invitation", email, name, role, tokenHash: sha256(token), createdBy: u.id, expiresAt: new Date(Date.now() + 7 * 864e5) });
    const link = appUrl(`/lien/${token}`);
    const mail = await sendMail(email, "Invitation au QG de De l'Ombre à la Lumière", mailLayout(`${u.name} vous invite au QG`, "Le quartier général numérique du média vous attend. Ce lien est personnel et valable 7 jours.", { label: "Créer mon accès", url: link }));
    await audit({ userId: u.id, action: "utilisateur.invitation", sensitive: true, summary: `Invitation envoyée à ${email} (${role})` });
    return { ok: true as const, data: { link, sent: mail.sent }, message: mail.sent ? "Invitation envoyée par e-mail" : "Invitation créée — copiez le lien" };
  });
}

export async function updateUserAccess(userId: string, input: { role: string; active: boolean; title?: string; overrides: Record<string, boolean> }) {
  return run(async () => {
    const u = await assertPermission("permissions.gerer");
    const role = Role.parse(input.role);
    const overrides = Object.fromEntries(Object.entries(input.overrides).filter(([k]) => k in PERMISSIONS).map(([k, v]) => [k, Boolean(v)]));
    if (userId === u.id && (role !== "administrateur" || !input.active)) userError("Vous ne pouvez pas retirer vos propres droits d'administrateur ni désactiver votre compte.");
    if (role !== "administrateur" || !input.active) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users).where(and(eq(s.users.role, "administrateur"), eq(s.users.active, true), ne(s.users.id, userId)));
      if (n === 0) userError("Il doit rester au moins un administrateur actif.");
    }
    const [t] = await db.update(s.users).set({ role, active: input.active, title: input.title || null, permissionOverrides: overrides, updatedAt: new Date() }).where(eq(s.users.id, userId)).returning();
    if (!input.active) await db.delete(s.sessions).where(eq(s.sessions.userId, userId));
    await audit({ userId: u.id, action: "utilisateur.droits", entityType: "user", entityId: userId, sensitive: true, summary: `Droits de ${t.name} : ${role}${input.active ? "" : " (désactivé)"}`, metadata: { overrides } });
    return { ok: true as const, message: "Droits mis à jour" };
  });
}

export async function adminResetLink(userId: string) {
  return run(async () => {
    const u = await assertPermission("utilisateurs.gerer");
    const [t] = await db.select().from(s.users).where(eq(s.users.id, userId));
    if (!t) userError("Utilisateur introuvable");
    const { link } = await createResetToken(t.id, t.email, u.id);
    const mail = await sendMail(t.email, "Réinitialisation de votre mot de passe", mailLayout("Nouveau mot de passe", "Un administrateur a demandé la réinitialisation de votre mot de passe. Ce lien est valable une heure.", { label: "Choisir un mot de passe", url: link }));
    await audit({ userId: u.id, action: "utilisateur.lien_reinitialisation", entityType: "user", entityId: userId, sensitive: true, summary: `Lien de réinitialisation créé pour ${t.name}` });
    return { ok: true as const, data: { link, sent: mail.sent }, message: mail.sent ? "Lien envoyé par e-mail" : "Lien créé (valable 1 h) — transmettez-le directement" };
  });
}

export async function revokeSessions(userId: string) {
  return run(async () => {
    const u = await assertPermission("utilisateurs.gerer");
    await db.delete(s.sessions).where(eq(s.sessions.userId, userId));
    await audit({ userId: u.id, action: "utilisateur.deconnexion_forcee", entityType: "user", entityId: userId, sensitive: true, summary: "Toutes les sessions ont été fermées" });
    return { ok: true as const, message: "Toutes les sessions de cet utilisateur ont été fermées" };
  });
}

export async function updateProfile(input: { name: string; title: string }) {
  return run(async () => {
    const u = await assertUser();
    await db.update(s.users).set({ name: z.string().trim().min(1).max(120).parse(input.name), title: input.title.trim().slice(0, 120) || null, updatedAt: new Date() }).where(eq(s.users.id, u.id));
    return { ok: true as const, message: "Profil enregistré" };
  });
}

export async function changePassword(current: string, next: string) {
  return run(async () => {
    const u = await assertUser();
    const [row] = await db.select().from(s.users).where(eq(s.users.id, u.id));
    if (!row?.passwordHash || !(await verifyPassword(row.passwordHash, current))) userError("Mot de passe actuel incorrect.");
    const problem = passwordProblem(next); if (problem) userError(problem);
    await db.update(s.users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(s.users.id, u.id));
    // Ferme les autres sessions, garde celle-ci
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    await db.delete(s.sessions).where(and(eq(s.sessions.userId, u.id), ne(s.sessions.tokenHash, sha256(token))));
    await audit({ userId: u.id, action: "auth.changement_mot_de_passe", entityType: "user", entityId: u.id, sensitive: true, summary: "Mot de passe modifié (autres sessions fermées)" });
    return { ok: true as const, message: "Mot de passe modifié — vos autres appareils ont été déconnectés" };
  });
}

export async function mailStatus() { return isMailConfigured(); }
