"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { ENTITY_PERMS, isEntityType } from "@/lib/entity-perms";

const MAX = 15 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp|gif|heic)|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|vnd\.oasis\.opendocument\.[a-z.]+|zip))$/;

export async function uploadAttachment(form: FormData) {
  return run(async () => {
    const entityType = String(form.get("entityType")); const entityId = String(form.get("entityId"));
    if (!isEntityType(entityType)) userError("Type d'élément inconnu");
    const u = await assertPermission(ENTITY_PERMS[entityType].write);
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) userError("Aucun fichier sélectionné");
    const ids: string[] = [];
    for (const f of files) {
      if (f.size > MAX) userError(`« ${f.name} » dépasse 15 Mo. Déposez les fichiers lourds sur Google Drive et ajoutez le lien.`);
      if (!ALLOWED.test(f.type)) userError(`Format non accepté pour « ${f.name} » (${f.type || "inconnu"}).`);
      const [a] = await db.insert(s.attachments).values({
        entityType, entityId: z.uuid().parse(entityId), filename: f.name.slice(0, 300), mimeType: f.type, size: f.size,
        data: Buffer.from(await f.arrayBuffer()), uploadedBy: u.id,
      }).returning({ id: s.attachments.id });
      ids.push(a.id);
    }
    await audit({ userId: u.id, action: "piece_jointe.ajout", entityType, entityId, summary: `${files.length} fichier(s) ajouté(s)` });
    return { ok: true as const, data: ids, message: files.length > 1 ? `${files.length} fichiers ajoutés` : "Fichier ajouté" };
  });
}

export async function addLinkAttachment(input: { entityType: string; entityId: string; name: string; url: string }) {
  return run(async () => {
    if (!isEntityType(input.entityType)) userError("Type d'élément inconnu");
    const u = await assertPermission(ENTITY_PERMS[input.entityType].write);
    const url = z.url({ message: "Lien invalide" }).parse(input.url.trim());
    const [a] = await db.insert(s.attachments).values({ entityType: input.entityType, entityId: z.uuid().parse(input.entityId), filename: input.name.trim() || url, url, uploadedBy: u.id }).returning({ id: s.attachments.id });
    return { ok: true as const, data: a.id, message: "Lien ajouté" };
  });
}

export async function deleteAttachment(id: string) {
  return run(async () => {
    const [a] = await db.select({ entityType: s.attachments.entityType, entityId: s.attachments.entityId, filename: s.attachments.filename }).from(s.attachments).where(eq(s.attachments.id, id));
    if (!a) userError("Fichier introuvable");
    if (!isEntityType(a.entityType)) userError("Type inconnu");
    const u = await assertPermission(ENTITY_PERMS[a.entityType].write);
    await db.delete(s.attachments).where(eq(s.attachments.id, id));
    await audit({ userId: u.id, action: "piece_jointe.suppression", entityType: a.entityType, entityId: a.entityId, summary: `Fichier « ${a.filename} » supprimé` });
    return { ok: true as const, message: "Fichier supprimé" };
  });
}
