/** Sauvegarde complète en ligne de commande : npm run db:backup  → backups/dlal-AAAA-MM-JJ.json */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildBackup } from "../src/lib/backup";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const json = await buildBackup(drizzle(client));
  mkdirSync("backups", { recursive: true });
  const file = `backups/dlal-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, json);
  console.log(`✓ Sauvegarde écrite : ${file} (${Math.round(json.length / 1024)} Ko)`);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
