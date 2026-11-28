import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * Maintenance (administrateurs) : ferme les connexions à la base restées inactives (laissées par d'anciennes instances).
 * Sans danger : les instances en rouvrent automatiquement au besoin. Utile si des pages ne se chargent plus faute de place dans le pooler.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !can(user, "utilisateurs.gerer")) return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  const etat = async () => (await db.execute(sql`select coalesce(state,'?') as etat, count(*)::int as n from pg_stat_activity where datname = current_database() group by state`)) as unknown as { etat: string; n: number }[];
  const avant = await etat();
  const res = await db.execute(sql`select count(pg_terminate_backend(pid))::int as fermees from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'idle' and state_change < now() - interval '5 seconds'`);
  const apres = await etat();
  return NextResponse.json({ avant, fermees: (res as unknown as { fermees: number }[])[0]?.fermees ?? 0, apres }, { headers: { "Cache-Control": "no-store" } });
}
