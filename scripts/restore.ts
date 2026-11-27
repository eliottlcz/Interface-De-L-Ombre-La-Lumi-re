/**
 * Restauration d'une sauvegarde JSON dans une base VIDE déjà migrée.
 *   npm run db:migrate && npx tsx scripts/restore.ts backups/dlal-AAAA-MM-JJ.json
 * La même VAULT_MASTER_KEY que lors de la sauvegarde est nécessaire pour relire le coffre-fort.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { BACKUP_TABLES } from "../src/lib/backup";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Indiquez le fichier de sauvegarde.");
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.format !== "dlal-qg-backup") throw new Error("Fichier de sauvegarde non reconnu.");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  await sql.begin(async (tx) => {
    const [{ n }] = await tx`select count(*)::int as n from users`;
    if (n > 0 && !process.argv.includes("--force")) throw new Error("La base n'est pas vide (ajoutez --force pour fusionner).");
    await tx`alter table audit_log disable trigger audit_log_no_update`;
    for (const t of BACKUP_TABLES) {
      const rows = data.tables[t] ?? [];
      if (!rows.length) continue;
      await tx.unsafe(`insert into "${t}" select * from jsonb_populate_recordset(null::"${t}", $1::text::jsonb) on conflict do nothing`, [JSON.stringify(rows)]);
      console.log(`  ${t} : ${rows.length}`);
    }
    await tx`alter table audit_log enable trigger audit_log_no_update`;
  });
  console.log("✓ Restauration terminée");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
