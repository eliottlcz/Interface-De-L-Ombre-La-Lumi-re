import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getReminders } from "@/lib/reminders";
import { loadTasks } from "@/lib/task-queries";
import { crossPlatform, internalCounts } from "@/lib/metrics";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/** Diagnostic public : temps de réponse de la base, sans aucune donnée. */
export async function GET(req: NextRequest) {
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
  // ?pages=1 : exécute les lectures du tableau de bord avec un profil fictif (aucune donnée n'est renvoyée, seulement les durées)
  if (req.nextUrl.searchParams.get("pages") === "1") {
    const fake = { id: "00000000-0000-0000-0000-000000000000", email: "x@x", name: "Test", title: null, role: "administrateur" as const, permissionOverrides: {}, permissions: ROLE_PERMISSIONS.administrateur };
    const mesure = async (nom: string, f: () => Promise<unknown>) => {
      const t = Date.now();
      try { await Promise.race([f(), new Promise((_, r) => setTimeout(() => r(new Error("pas de réponse après 8 s")), 8000))]); out[`page_${nom}`] = `ok ${Date.now() - t} ms`; }
      catch (e) { out[`page_${nom}`] = `ERREUR ${(e as Error).message.slice(0, 120)} (${Date.now() - t} ms)`; }
    };
    await mesure("rappels", () => getReminders(fake));
    await mesure("taches", () => loadTasks());
    await mesure("compteurs", () => internalCounts());
    await mesure("abonnes", () => crossPlatform("abonnes"));
    await mesure("vues", () => crossPlatform("vues"));
  }
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? "inconnue", total_ms: Date.now() - t0, ...out }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
