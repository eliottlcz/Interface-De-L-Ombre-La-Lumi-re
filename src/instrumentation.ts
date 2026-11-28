/** Enregistre les erreurs serveur (page, route, action) pour le diagnostic en production. N'enregistre aucune donnée personnelle. */
export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    const e = err as { message?: string; digest?: string; stack?: string };
    await db.execute(sql`insert into server_errors (method, path, message, digest, stack) values (${request.method}, ${request.path.split("?")[0].slice(0, 200)}, ${String(e?.message ?? err).slice(0, 500)}, ${e?.digest ?? null}, ${String(e?.stack ?? "").split("\n").slice(0, 8).join("\n").slice(0, 1500)})`);
  } catch { /* ne jamais aggraver l'erreur d'origine */ }
}
