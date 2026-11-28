import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Contrôle de santé public : la configuration est-elle complète, la base répond-elle ? Aucune donnée, aucune valeur secrète. */
export async function GET() {
  const t0 = Date.now();
  const checks: Record<string, string> = {};
  for (const [nom, requete] of [
    ["base", "select 1"],
    ["tables", "select (select count(*) from users) + (select count(*) from sessions)"],
    ["synchro", "select last_value from dlal_change_seq"],
  ] as const) {
    const t = Date.now();
    try { await db.execute(sql.raw(requete)); checks[nom] = `ok (${Date.now() - t} ms)`; } catch { checks[nom] = "ERREUR"; }
  }
  const presentes = (noms: string[]) => Object.fromEntries(noms.map((n) => [n, Boolean(process.env[n])]));
  let cle = false;
  try { cle = Buffer.from(process.env.VAULT_MASTER_KEY ?? "", "base64").length === 32; } catch { /* absent */ }
  const requis = presentes(["DATABASE_URL", "APP_URL", "SESSION_SECRET", "CRON_SECRET"]);
  const ok = Object.values(checks).every((v) => v.startsWith("ok")) && Object.values(requis).every(Boolean) && cle;
  return NextResponse.json({
    statut: ok ? "ok" : "attention",
    region: process.env.VERCEL_REGION ?? "locale",
    total_ms: Date.now() - t0,
    ...checks,
    configuration_requise: { ...requis, VAULT_MASTER_KEY_valide: cle },
    configuration_facultative: presentes(["ANTHROPIC_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "META_APP_ID", "TIKTOK_CLIENT_KEY"]),
  }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
