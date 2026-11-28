import { NextResponse, type NextRequest } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Déconnexion par formulaire classique : supprime la session en base et le cookie, puis 303 vers la connexion. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return new NextResponse("Origine refusée", { status: 403 });
  const u = await getCurrentUser();
  await destroySession();
  if (u) await audit({ userId: u.id, action: "auth.deconnexion", summary: `${u.name} s'est déconnecté(e)` });
  return NextResponse.redirect(new URL("/connexion?fin=1", req.url), 303);
}
