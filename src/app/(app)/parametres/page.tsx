import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { can, PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { isMailConfigured } from "@/lib/mail";
import { isEncryptionConfigured } from "@/lib/crypto";
import { isAiConfigured, AI_MODEL } from "@/lib/ai-config";
import { googleConfigured } from "@/lib/integrations/google";
import { CONNECTORS } from "@/lib/integrations/connectors";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const admin = can(user, "utilisateurs.gerer");
  const [me] = await db.select({ title: s.users.title }).from(s.users).where(eq(s.users.id, user.id));
  const [users, invites, integ, audits, logins, mySessions] = await Promise.all([
    admin || can(user, "permissions.gerer") ? db.select({ id: s.users.id, name: s.users.name, email: s.users.email, title: s.users.title, role: s.users.role, active: s.users.active, overrides: s.users.permissionOverrides, lastLoginAt: s.users.lastLoginAt }).from(s.users).orderBy(s.users.name) : Promise.resolve([]),
    admin ? db.select().from(s.authTokens).where(and(eq(s.authTokens.type, "invitation"), isNull(s.authTokens.usedAt), gt(s.authTokens.expiresAt, new Date()))) : Promise.resolve([]),
    db.select().from(s.integrations),
    can(user, "journal.voir") ? db.select({ a: s.auditLog, name: s.users.name }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.userId)).where(eq(s.auditLog.sensitive, true)).orderBy(desc(s.auditLog.createdAt)).limit(150) : Promise.resolve([]),
    can(user, "journal.voir") ? db.select().from(s.loginEvents).orderBy(desc(s.loginEvents.createdAt)).limit(150) : Promise.resolve([]),
    db.select().from(s.sessions).where(and(eq(s.sessions.userId, user.id), gt(s.sessions.expiresAt, new Date()))).orderBy(desc(s.sessions.lastSeenAt)),
  ]);
  const integrations = [
    { id: "google_drive", label: "Google Drive", configured: googleConfigured(), env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], oauth: true },
    ...Object.values(CONNECTORS).map((c) => ({ id: c.id, label: c.label, configured: c.isConfigured(), env: c.envVars, oauth: true, docs: c.docs })),
  ].map((i) => { const row = integ.find((r) => r.provider === i.id); return { ...i, connected: Boolean(row?.accessTokenEnc), account: row?.accountLabel ?? null, lastSync: row?.lastSyncAt?.toISOString() ?? null, lastError: row?.lastError ?? null, expiresAt: row?.expiresAt?.toISOString() ?? null }; });
  return <SettingsView
    tab={sp.onglet ?? "profil"} flash={{ error: sp.erreur ?? null, connected: sp.connecte ?? null }}
    me={{ id: user.id, name: user.name, email: user.email, title: me?.title ?? "", role: user.role, permissions: user.permissions }}
    perms={{ admin, permissions: can(user, "permissions.gerer"), integrations: can(user, "integrations.gerer"), journal: can(user, "journal.voir"), exports: can(user, "exports.faire") }}
    users={users.map((u) => ({ ...u, overrides: u.overrides ?? {}, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
    invites={invites.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
    integrations={integrations}
    system={{ mail: isMailConfigured(), encryption: isEncryptionConfigured(), ai: isAiConfigured(), aiModel: AI_MODEL, cron: Boolean(process.env.CRON_SECRET), directDb: Boolean(process.env.DATABASE_URL_DIRECT) }}
    permissionCatalog={PERMISSIONS} rolePermissions={ROLE_PERMISSIONS}
    audits={audits.map(({ a, name }) => ({ id: a.id, name, summary: a.summary, action: a.action, at: a.createdAt.toISOString() }))}
    logins={logins.map((l) => ({ id: l.id, email: l.email, success: l.success, ip: l.ip, ua: l.userAgent, reason: l.reason, at: l.createdAt.toISOString() }))}
    sessions={mySessions.map((x) => ({ id: x.id, ua: x.userAgent, ip: x.ip, lastSeenAt: x.lastSeenAt.toISOString() }))}
  />;
}
