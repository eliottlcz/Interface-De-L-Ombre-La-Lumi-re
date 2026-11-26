import { eq } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { ENTITY_PERMS, isEntityType } from "@/lib/entity-perms";

/** Téléchargement d'une pièce jointe — contrôle des permissions à chaque accès. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getCurrentUser();
  if (!u) return new Response("Non authentifié", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Introuvable", { status: 404 });
  const [a] = await db.select().from(s.attachments).where(eq(s.attachments.id, id));
  if (!a || !isEntityType(a.entityType)) return new Response("Introuvable", { status: 404 });
  if (!can(u, ENTITY_PERMS[a.entityType].read)) return new Response("Accès refusé", { status: 403 });
  if (a.entityType === "resource") {
    const [r] = await db.select({ restricted: s.resources.restricted }).from(s.resources).where(eq(s.resources.id, a.entityId));
    if (r?.restricted && !can(u, "ressources.restreintes")) return new Response("Accès refusé", { status: 403 });
  }
  if (a.url) return Response.redirect(a.url, 302);
  if (!a.data) return new Response("Fichier vide", { status: 404 });
  const inline = /^(application\/pdf|image\/)/.test(a.mimeType ?? "");
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mimeType ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
