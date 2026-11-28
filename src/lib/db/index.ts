import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dlalSql: ReturnType<typeof postgres> | undefined;
}

function client() {
  // Exécution du site : connexion « session » du pooler si elle est configurée (DATABASE_URL_DIRECT). Le pooler « transaction »
  // bloque indéfiniment les requêtes sans paramètres envoyées en parallèle (constaté en production) ; la connexion session les accepte toutes.
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas configurée");
  if (!globalThis.__dlalSql) {
    const serverless = Boolean(process.env.VERCEL);
    const transactionMode = !process.env.DATABASE_URL_DIRECT && /:6543\b/.test(url);
    globalThis.__dlalSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? (serverless ? 1 : 5)), // pooler session Supabase : 15 clients au total, toutes instances confondues
      prepare: transactionMode ? false : process.env.DATABASE_PREPARE !== "false", // pooler transaction : pas de requêtes préparées
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
      idle_timeout: serverless ? 10 : 30,  // referme une connexion inutilisée (libère le pooler)
      max_lifetime: 60 * 10,               // renouvelle les connexions anciennes
      connect_timeout: 10,                 // échoue vite plutôt que d'attendre indéfiniment
    });
  }
  return globalThis.__dlalSql;
}

export const db = drizzle(client(), { schema });
export type DB = typeof db;
export { schema };
