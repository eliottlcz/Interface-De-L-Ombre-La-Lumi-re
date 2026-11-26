import { asc, desc, eq, and } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { isEncryptionConfigured } from "@/lib/crypto";
import { vaultUnlockedUntil } from "@/lib/vault-lock";
import { VaultView } from "./vault-view";

export const metadata = { title: "Coffre-fort" };

export default async function VaultPage() {
  const user = await requirePagePermission("coffre.voir");
  // Les secrets chiffrés ne sont JAMAIS envoyés au navigateur : uniquement les métadonnées.
  const [items, log, until] = await Promise.all([
    db.select({ id: s.vaultItems.id, service: s.vaultItems.service, category: s.vaultItems.category, label: s.vaultItems.label, username: s.vaultItems.username, url: s.vaultItems.url, hasNotes: s.vaultItems.notesEnc, updatedAt: s.vaultItems.updatedAt })
      .from(s.vaultItems).orderBy(asc(s.vaultItems.category), asc(s.vaultItems.service)),
    can(user, "journal.voir") ? db.select({ a: s.auditLog, name: s.users.name }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.userId))
      .where(and(eq(s.auditLog.sensitive, true))).orderBy(desc(s.auditLog.createdAt)).limit(200) : Promise.resolve([]),
    vaultUnlockedUntil(),
  ]);
  return <VaultView
    items={items.map((i) => ({ ...i, hasNotes: Boolean(i.hasNotes), updatedAt: i.updatedAt.toISOString() }))}
    log={log.filter(({ a }) => a.action.startsWith("coffre.")).slice(0, 40).map(({ a, name }) => ({ id: a.id, summary: a.summary, name, at: a.createdAt.toISOString() }))}
    unlockedUntil={until} canEdit={can(user, "coffre.modifier")} encryptionReady={isEncryptionConfigured()} />;
}
