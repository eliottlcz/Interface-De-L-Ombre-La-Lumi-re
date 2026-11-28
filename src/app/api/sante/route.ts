import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getReminders } from "@/lib/reminders";
import { loadTasks } from "@/lib/task-queries";
import { crossPlatform, internalCounts } from "@/lib/metrics";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

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
    ["compteur_synchro", "select last_value from dlal_change_seq"],
    ["sessions", "select id from sessions limit 1"],
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
  if (req.nextUrl.searchParams.get("logins") === "1") {
    // Décompte anonyme des connexions de la dernière heure (sans adresse, sans identité) : le serveur a-t-il reçu et traité les tentatives ?
    try {
      const rows = await db.execute(sql.raw(`select success, coalesce(reason,'') as reason, round(extract(epoch from (now()-created_at))/60)::int as il_y_a_min from login_events where created_at > now() - interval '60 minutes' order by created_at desc limit 12`));
      out.connexions_derniere_heure = JSON.stringify((rows as unknown as { success: boolean; reason: string; il_y_a_min: number }[]).map((r) => `${r.success ? "réussie" : "échec" + (r.reason ? ":" + r.reason : "")} il y a ${r.il_y_a_min} min`));
      const ss = await db.execute(sql.raw(`select count(*)::int as n from sessions where created_at > now() - interval '60 minutes'`));
      out.sessions_creees_derniere_heure = String((ss as unknown as { n: number }[])[0].n);
    } catch (e) { out.connexions_derniere_heure = `ERREUR ${(e as Error).message.slice(0, 120)}`; }
  }
  if (req.nextUrl.searchParams.get("argon") === "1") {
    try {
      const t1 = Date.now(); const h = await hashPassword("diagnostic-Argon2-12345"); out.argon_hachage = `ok ${Date.now() - t1} ms`;
      const t2 = Date.now(); const ok = await verifyPassword(h, "diagnostic-Argon2-12345"); out.argon_verification = `${ok ? "ok" : "ECHEC"} ${Date.now() - t2} ms`;
    } catch (e) { out.argon_verification = `ERREUR ${(e as Error).message.slice(0, 120)}`; }
  }
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? "inconnue", total_ms: Date.now() - t0, ...out }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
