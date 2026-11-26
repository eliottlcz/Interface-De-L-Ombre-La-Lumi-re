import { NextResponse, type NextRequest } from "next/server";

/** Barrière d'accès : toute page hors authentification exige un cookie de session.
 *  La validité réelle de la session est vérifiée côté serveur à chaque requête. */
const PUBLIC = ["/connexion", "/mot-de-passe-oublie", "/lien/", "/api/cron/", "/api/integrations/callback", "/manifest.webmanifest", "/brand/", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("dlal_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
