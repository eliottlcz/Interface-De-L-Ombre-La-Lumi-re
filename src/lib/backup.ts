import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** Tables sauvegardées, dans l'ordre de restauration (dépendances d'abord). */
export const BACKUP_TABLES = [
  "users", "contacts", "contact_interactions", "episodes", "episode_stages", "tasks", "task_comments", "attachments", "events",
  "checklists", "checklist_items", "guest_documents", "contents", "transactions", "ideas", "idea_runs", "resources", "vault_items",
  "integrations", "metric_snapshots", "content_stats", "sync_runs", "notifications", "app_settings", "audit_log", "login_events",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildBackup(dbArg?: PostgresJsDatabase<any>) {
  const db = dbArg ?? (await import("@/lib/db")).db;
  const out: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    // bytea encodé en base64 par PostgreSQL pour un JSON portable
    const rows = await db.execute(sql.raw(`select to_jsonb(x) as r from (select * from "${t}") x`));
    out[t] = (rows as unknown as { r: Record<string, unknown> }[]).map((row) => row.r);
  }
  return JSON.stringify({ format: "dlal-qg-backup", version: 1, createdAt: new Date().toISOString(), tables: out });
}
