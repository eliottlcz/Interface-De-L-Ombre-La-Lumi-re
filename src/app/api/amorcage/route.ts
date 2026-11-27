import { NextResponse, type NextRequest } from "next/server";
import { count } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { seedReferenceData } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Première mise en route sans terminal : crée les invitations d'Eliott et d'Arthur.
 *   /api/amorcage?cle=<CRON_SECRET>&eliott=adresse1&arthur=adresse2
 * Protégée par le secret du serveur et DÉSACTIVÉE dès qu'un compte existe.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const p = req.nextUrl.searchParams;
  const txt = (msg: string, status = 200) => new NextResponse(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  if (!secret || !safeEqual(p.get("cle") ?? "", secret)) return txt("Non autorisé", 401);
  const [{ n }] = await db.select({ n: count() }).from(s.users);
  if (n > 0) return txt("Désactivé : des comptes existent déjà.", 403);
  const people = [
    { email: p.get("eliott"), name: "Eliott Le Clezio", role: "administrateur" as const },
    { email: p.get("arthur"), name: "Arthur Pomarede", role: "collaborateur" as const },
  ];
  if (people.some((x) => !x.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email))) return txt("Ajoutez &eliott=adresse&arthur=adresse (deux adresses valides).", 400);
  await seedReferenceData(db);
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");
  const lines: string[] = ["Liens d'invitation (usage unique, 7 jours). Chacun choisit son mot de passe.", ""];
  for (const x of people) {
    const token = randomToken();
    await db.insert(s.authTokens).values({ type: "invitation", email: x.email!.toLowerCase(), name: x.name, role: x.role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 864e5) });
    lines.push(`${x.name} (${x.role}) : ${base}/lien/${token}`);
  }
  return txt(lines.join("\n"));
}
