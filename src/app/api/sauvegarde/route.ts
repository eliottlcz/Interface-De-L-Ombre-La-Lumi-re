import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { buildBackup } from "@/lib/backup";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Sauvegarde complète téléchargeable (administrateurs). Les secrets restent chiffrés ; sessions et jetons exclus. */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return new Response("Non authentifié", { status: 401 });
  if (!can(u, "utilisateurs.gerer") || !can(u, "exports.faire")) return new Response("Accès refusé", { status: 403 });
  const body = await buildBackup();
  await audit({ userId: u.id, action: "sauvegarde.telechargement", sensitive: true, summary: "Sauvegarde complète téléchargée" });
  return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="dlal-sauvegarde-${todayISO()}.json"`, "Cache-Control": "no-store" } });
}
