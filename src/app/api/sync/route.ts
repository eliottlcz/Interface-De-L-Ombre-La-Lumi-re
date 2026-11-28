import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Compteur de modifications : léger, sans connexion permanente. Réservé aux personnes connectées. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const rows = await db.execute(sql`select last_value::text as v, is_called from dlal_change_seq`);
  const r = (rows as unknown as { v: string; is_called: boolean }[])[0];
  return NextResponse.json({ v: r.is_called ? r.v : "0" }, { headers: { "Cache-Control": "no-store" } });
}
