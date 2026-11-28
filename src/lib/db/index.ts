import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dlalSql: ReturnType<typeof postgres> | undefined;
}

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas configurée");
  if (!globalThis.__dlalSql) {
    // Hébergement serverless + pooler de base partagé : peu de connexions par instance, jamais conservées à vide.
    // (Des connexions gardées ouvertes par chaque instance saturent le pooler : les requêtes simultanées se bloquent alors indéfiniment.)
    const serverless = Boolean(process.env.VERCEL);
    globalThis.__dlalSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? (serverless ? 1 : 5)),
      prepare: process.env.DATABASE_PREPARE !== "false", // false avec le pooler Supabase (mode transaction)
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
      idle_timeout: serverless ? 5 : 30,   // referme une connexion inutilisée après quelques secondes
      max_lifetime: 60 * 10,               // renouvelle les connexions anciennes
      connect_timeout: 10,                 // échoue vite plutôt que d'attendre indéfiniment
    });
  }
  return globalThis.__dlalSql;
}

export const db = drizzle(client(), { schema });
export type DB = typeof db;
export { schema };
