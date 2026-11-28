import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Diagnostic public : temps de réponse de la base, sans aucune donnée. */
export async function GET() {
  const out: Record<string, string> = {};
  const t0 = Date.now();
  for (const [nom, requete] of [
    ["base_simple", "select 1"],
    ["utilisateurs", "select count(*) from users"],
    ["taches", "select id from tasks limit 1"],
    ["journal", "select id from audit_log limit 1"],
    ["episodes", "select id from episodes limit 1"],
    ["contacts", "select id from contacts limit 1"],
  ] as const) {
    const t = Date.now();
    try { await db.execute(sql.raw(requete)); out[nom] = `ok ${Date.now() - t} ms`; }
    catch (e) { out[nom] = `ERREUR ${(e as Error).message.slice(0, 120)} (${Date.now() - t} ms)`; }
  }
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? "inconnue", total_ms: Date.now() - t0, ...out }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
