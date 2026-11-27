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
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const page = (body: string, status: number) => new NextResponse(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Amorçage</title></head><body style="font:18px/1.6 system-ui;background:#0a0a0a;color:#f4efe0;padding:24px;max-width:720px;margin:auto">${body}</body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  const txt = (msg: string, status = 200) => page(`<p>${esc(msg)}</p>`, status);
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
  const items: string[] = [];
  for (const x of people) {
    const token = randomToken();
    await db.insert(s.authTokens).values({ type: "invitation", email: x.email!.toLowerCase(), name: x.name, role: x.role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 864e5) });
    const url = `${base}/lien/${token}`;
    items.push(`<li style="margin:18px 0"><strong>${esc(x.name)}</strong> (${esc(x.role)})<br><a style="color:#dfc662;word-break:break-all" href="${esc(url)}">${esc(url)}</a></li>`);
  }
  return page(`<h1 style="font-size:22px">Liens d'invitation</h1><p>Usage unique, valables 7 jours. Chacun choisit son mot de passe. N'ouvrez que le vôtre.</p><ul style="padding-left:20px">${items.join("")}</ul>`, 200);
}
