import "server-only";
import { googleAccessToken } from "./google";
import { getIntegration, setIntegrationError } from "./store";

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; modifiedTime?: string; size?: string; iconLink?: string };
export const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Sous-dossiers créés pour chaque épisode (les vidéos lourdes restent sur Drive). */
export const EPISODE_SUBFOLDERS = ["Rushs", "Audio", "Montages", "Miniatures", "Exports", "Éléments graphiques", "Administratif"];

export async function driveStatus() {
  const row = await getIntegration("google_drive");
  return { connected: Boolean(row?.accessTokenEnc), account: row?.accountLabel ?? null, lastError: row?.lastError ?? null, rootFolderId: (row?.meta?.rootFolderId as string) ?? null };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await googleAccessToken("google_drive");
  if (!token) throw new Error("⚠ Google Drive n'est pas connecté.");
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const txt = await res.text();
    await setIntegrationError("google_drive", `Drive ${res.status} : ${txt.slice(0, 200)}`);
    throw new Error(`⚠ Google Drive a refusé la requête (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export function folderIdFromUrl(url: string): string | null {
  const m = url.match(/folders\/([a-zA-Z0-9_-]{10,})/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(url.trim()) ? url.trim() : null;
}

export async function listFolder(folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const r = await call<{ files: DriveFile[] }>(`/files?q=${q}&fields=files(id,name,mimeType,webViewLink,modifiedTime,size,iconLink)&orderBy=folder,name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return r.files;
}
export async function getFile(id: string): Promise<DriveFile> {
  return call<DriveFile>(`/files/${id}?fields=id,name,mimeType,webViewLink,modifiedTime,size&supportsAllDrives=true`);
}
export async function searchDrive(term: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`name contains '${term.replace(/'/g, "\\'")}' and trashed = false`);
  const r = await call<{ files: DriveFile[] }>(`/files?q=${q}&fields=files(id,name,mimeType,webViewLink,modifiedTime,size)&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return r.files;
}
export async function createFolder(name: string, parentId?: string | null): Promise<DriveFile> {
  return call<DriveFile>(`/files?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
}
/** Envoie un petit document dans un dossier Drive (upload multipart). */
export async function uploadFile(folderId: string, name: string, mime: string, data: Buffer): Promise<DriveFile> {
  const token = await googleAccessToken("google_drive");
  if (!token) throw new Error("⚠ Google Drive n'est pas connecté.");
  const boundary = "dlal" + Math.random().toString(16).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    data, Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink&supportsAllDrives=true", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error(`⚠ Envoi vers Drive refusé (${res.status}).`);
  return res.json();
}

/** Crée l'arborescence d'un épisode. Renvoie null si Drive n'est pas connecté. */
export async function createEpisodeFolder(title: string): Promise<DriveFile | null> {
  const st = await driveStatus();
  if (!st.connected) return null;
  const root = await createFolder(title, st.rootFolderId);
  for (const sub of EPISODE_SUBFOLDERS) await createFolder(sub, root.id);
  return root;
}
