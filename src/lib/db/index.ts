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
    globalThis.__dlalSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      prepare: process.env.DATABASE_PREPARE !== "false", // false avec le pooler Supabase (mode transaction)
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    });
  }
  return globalThis.__dlalSql;
}

export const db = drizzle(client(), { schema });
export type DB = typeof db;
export { schema };
