"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { driveStatus, folderIdFromUrl, listFolder, searchDrive, uploadFile, type DriveFile } from "@/lib/integrations/drive";

export async function browseDrive(folderId: string) {
  return run(async () => {
    await assertPermission("production.voir");
    if (!(await driveStatus()).connected) userError("Google Drive n'est pas connecté.");
    const id = z.string().regex(/^[a-zA-Z0-9_-]{10,}$/, "Identifiant de dossier invalide").parse(folderId);
    const files: DriveFile[] = await listFolder(id);
    return { ok: true as const, data: files };
  });
}

export async function searchDriveFiles(term: string) {
  return run(async () => {
    await assertPermission("production.voir");
    if (!(await driveStatus()).connected) userError("Google Drive n'est pas connecté.");
    const t = z.string().trim().min(2, "Au moins deux caractères").max(100).parse(term);
    return { ok: true as const, data: await searchDrive(t) };
  });
}

/** Associe un dossier Drive (lien ou identifiant) à un épisode ou un invité. */
export async function linkDriveFolder(target: "episode" | "contact", id: string, urlOrId: string) {
  return run(async () => {
    const u = await assertPermission(target === "episode" ? "production.modifier" : "crm.modifier");
    const folderId = folderIdFromUrl(urlOrId);
    if (!folderId) userError("Lien de dossier Drive non reconnu.");
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    if (target === "episode") await db.update(s.episodes).set({ driveFolderId: folderId, driveFolderUrl: url }).where(eq(s.episodes.id, id));
    else await db.update(s.contacts).set({ driveFolderId: folderId, driveFolderUrl: url }).where(eq(s.contacts.id, id));
    await audit({ userId: u.id, action: "drive.association", entityType: target, entityId: id, summary: "Dossier Drive associé" });
    return { ok: true as const, message: "Dossier associé" };
  });
}

export async function uploadToDrive(form: FormData) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const folderId = z.string().regex(/^[a-zA-Z0-9_-]{10,}$/).parse(form.get("folderId"));
    const f = form.get("file");
    if (!(f instanceof File) || !f.size) userError("Aucun fichier");
    if (f.size > 15 * 1024 * 1024) userError("Au-delà de 15 Mo (rushs, exports), déposez le fichier directement dans Google Drive.");
    const r = await uploadFile(folderId, f.name, f.type || "application/octet-stream", Buffer.from(await f.arrayBuffer()));
    await audit({ userId: u.id, action: "drive.envoi", summary: `Fichier « ${f.name} » envoyé sur Drive` });
    return { ok: true as const, data: r, message: "Fichier envoyé sur Drive" };
  });
}
