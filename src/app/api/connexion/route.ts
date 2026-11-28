import { NextResponse, type NextRequest } from "next/server";
import { attemptLogin } from "@/lib/auth/login";

export const dynamic = "force-dynamic";

/**
 * Connexion par formulaire classique (sans JavaScript, sans action serveur) : POST → 303 vers la page demandée.
 * Fonctionne sur tout navigateur et tout réseau ; l'erreur éventuelle revient par un cookie éphémère.
 */
export async function POST(req: NextRequest) {
  // Protection contre les envois depuis un autre site
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host && new URL(origin).host !== req.headers.get("host")) {
    return new NextResponse("Origine refusée", { status: 403 });
  }
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const rawNext = String(form.get("next") ?? "/");
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/";
  const result = await attemptLogin(email, String(form.get("password") ?? ""));
  if (result.ok) return NextResponse.redirect(new URL(next, req.url), 303);
  const res = NextResponse.redirect(new URL(`/connexion${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`, req.url), 303);
  res.cookies.set("dlal_flash", JSON.stringify({ error: result.error, email: email.trim().slice(0, 200) }), { httpOnly: true, sameSite: "lax", path: "/connexion", maxAge: 60, secure: process.env.NODE_ENV === "production" });
  return res;
}
