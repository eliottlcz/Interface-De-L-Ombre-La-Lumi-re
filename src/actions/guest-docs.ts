"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { GUEST_DOC_KIND } from "@/lib/labels";

export async function createGuestDoc(input: { contactId: string; episodeId?: string | null; kind: keyof typeof GUEST_DOC_KIND; title?: string }) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const kind = z.enum(["droit_image", "autorisation_diffusion", "production", "complementaire"]).parse(input.kind);
    const [d] = await db.insert(s.guestDocuments).values({ contactId: z.uuid().parse(input.contactId), episodeId: input.episodeId || null, kind, title: input.title?.trim() || GUEST_DOC_KIND[kind] }).returning();
    await audit({ userId: u.id, action: "document_invite.creation", entityType: "guest_doc", entityId: d.id, summary: `Document attendu : ${d.title}` });
    return { ok: true as const, message: "Document ajouté à la liste" };
  });
}

/** Dépose la preuve (fichier signé ou lien) : le document passe en « Reçu ». */
export async function attachGuestDocProof(form: FormData) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const id = z.uuid().parse(form.get("id"));
    const [d] = await db.select().from(s.guestDocuments).where(eq(s.guestDocuments.id, id));
    if (!d) userError("Document introuvable");
    const file = form.get("file");
    const url = String(form.get("url") ?? "").trim();
    let proofAttachmentId: string | null = d.proofAttachmentId;
    let proofUrl: string | null = d.proofUrl;
    if (file instanceof File && file.size > 0) {
      if (file.size > 15 * 1024 * 1024) userError("Fichier trop lourd (15 Mo max). Déposez-le sur Drive et collez le lien.");
      const [a] = await db.insert(s.attachments).values({ entityType: "guest_doc", entityId: id, filename: file.name, mimeType: file.type, size: file.size, data: Buffer.from(await file.arrayBuffer()), uploadedBy: u.id }).returning();
      proofAttachmentId = a.id;
    } else if (url) {
      proofUrl = z.url({ message: "Lien invalide" }).parse(url);
    } else userError("Ajoutez le document signé (fichier) ou un lien vers celui-ci : sans preuve, il ne peut pas être marqué reçu.");
    await db.update(s.guestDocuments).set({ proofAttachmentId, proofUrl, status: "recu", receivedAt: new Date(), updatedAt: new Date() }).where(eq(s.guestDocuments.id, id));
    await audit({ userId: u.id, action: "document_invite.reception", entityType: "guest_doc", entityId: id, sensitive: true, summary: `Preuve déposée : ${d.title}` });
    return { ok: true as const, message: "Preuve enregistrée — document reçu" };
  });
}

export async function setGuestDocStatus(id: string, status: "manquant" | "demande" | "valide") {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [d] = await db.select().from(s.guestDocuments).where(eq(s.guestDocuments.id, id));
    if (!d) userError("Document introuvable");
    if (status === "valide") {
      if (!d.proofAttachmentId && !d.proofUrl) userError("Impossible de valider un document sans preuve de réception.");
      await db.update(s.guestDocuments).set({ status, validatedBy: u.id, validatedAt: new Date(), updatedAt: new Date() }).where(eq(s.guestDocuments.id, id));
    } else {
      await db.update(s.guestDocuments).set({ status, validatedBy: null, validatedAt: null, updatedAt: new Date() }).where(eq(s.guestDocuments.id, id));
    }
    await audit({ userId: u.id, action: "document_invite.statut", entityType: "guest_doc", entityId: id, sensitive: status === "valide", summary: `${d.title} → ${status}` });
    return { ok: true as const, message: status === "valide" ? "Document validé ✓" : "Statut mis à jour" };
  });
}

export async function deleteGuestDoc(id: string) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [d] = await db.select().from(s.guestDocuments).where(eq(s.guestDocuments.id, id));
    if (!d) userError("Document introuvable");
    await db.delete(s.guestDocuments).where(eq(s.guestDocuments.id, id));
    await audit({ userId: u.id, action: "document_invite.suppression", entityType: "guest_doc", entityId: id, sensitive: true, summary: `Document retiré : ${d.title}` });
    return { ok: true as const, message: "Document retiré" };
  });
}
