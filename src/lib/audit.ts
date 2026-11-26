import "server-only";
import { db, schema } from "@/lib/db";

export async function audit(entry: {
  userId?: string | null; action: string; summary: string;
  entityType?: string; entityId?: string | null; sensitive?: boolean; metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(schema.auditLog).values({
      userId: entry.userId ?? null, action: entry.action, summary: entry.summary,
      entityType: entry.entityType, entityId: entry.entityId ?? null,
      sensitive: entry.sensitive ?? false, metadata: entry.metadata,
    });
  } catch (e) {
    // Le journal ne doit jamais faire échouer une action — mais l'erreur est tracée côté serveur.
    console.error("[audit] échec d'écriture", (e as Error).message);
  }
}
