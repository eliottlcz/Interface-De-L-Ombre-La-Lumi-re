import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applique les migrations. Au déploiement (Vercel), un échec de connexion ne doit pas empêcher la mise en ligne :
 * les migrations déjà appliquées restent valables, et l'échec est signalé en clair dans le journal de construction.
 */
async function main() {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante");
  const client = postgres(url, { max: 1, connect_timeout: 15, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require" });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("✓ Migrations appliquées");
  } finally {
    await client.end({ timeout: 2 }).catch(() => {});
  }
}
main().catch((e) => {
  console.error("⚠ MIGRATIONS NON APPLIQUÉES :", e instanceof Error ? e.message : e);
  // En local ou manuellement : échec franc. Au déploiement : on poursuit la construction.
  process.exit(process.env.VERCEL ? 0 : 1);
});
