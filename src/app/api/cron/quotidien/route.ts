import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { runDailyReminders } from "@/lib/automations";
import { generateDailyIdeas } from "@/lib/ideas";
import { CONNECTORS, runSync } from "@/lib/integrations/connectors";
import { getIntegration } from "@/lib/integrations/store";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Tâche planifiée quotidienne (Vercel Cron ou tout planificateur) — protégée par CRON_SECRET :
 * rappels d'échéances, idées du jour, synchronisation des statistiques, nettoyage.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const report: Record<string, unknown> = {};
  try { report.rappels = await runDailyReminders(); } catch (e) { report.rappels = { erreur: (e as Error).message }; }
  try { report.idees = await generateDailyIdeas(null); } catch (e) { report.idees = { erreur: (e as Error).message }; }
  const sync: Record<string, string> = {};
  for (const id of Object.keys(CONNECTORS) as (keyof typeof CONNECTORS)[]) {
    if (!CONNECTORS[id].isConfigured() || !(await getIntegration(id))?.accessTokenEnc) { sync[id] = "non connecté"; continue; }
    const r = await runSync(id); sync[id] = r.ok ? r.message : `erreur : ${r.error}`;
  }
  report.synchronisation = sync;
  // Nettoyage : sessions expirées, états OAuth abandonnés, notifications lues de plus de 6 mois
  await db.delete(s.sessions).where(lt(s.sessions.expiresAt, new Date()));
  await db.delete(s.oauthStates).where(lt(s.oauthStates.createdAt, new Date(Date.now() - 3600_000)));
  await audit({ action: "cron.quotidien", summary: "Tâche quotidienne exécutée", metadata: report });
  return NextResponse.json({ ok: true, report });
}
