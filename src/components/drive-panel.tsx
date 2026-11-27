"use client";
import { useEffect, useRef, useState } from "react";
import { Folder, FileText, ExternalLink, ChevronLeft, Upload, FolderPlus, Link2 } from "lucide-react";
import { Button, Input, useAction, useToast } from "@/components/ui";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { browseDrive, linkDriveFolder, uploadToDrive } from "@/actions/drive";
import { createDriveFolderForEpisode } from "@/actions/production";
import type { DriveFile } from "@/lib/integrations/drive";
import { formatDate } from "@/lib/dates";

/** Explorateur Drive d'une fiche : ouvrir, parcourir les sous-dossiers (Rushs, Audio, Montages…), envoyer un document. */
export function DrivePanel({ target, id, folderId, folderUrl, connected, canEdit }: { target: "episode" | "contact"; id: string; folderId: string | null; folderUrl: string | null; connected: boolean; canEdit: boolean }) {
  const [stack, setStack] = useState<{ id: string; name: string }[]>(folderId ? [{ id: folderId, name: "Dossier" }] : []);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const { pending, exec } = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const cur = stack[stack.length - 1];

  useEffect(() => { setStack(folderId ? [{ id: folderId, name: "Dossier" }] : []); }, [folderId]);
  useEffect(() => {
    if (!connected || !cur) return;
    let alive = true;
    setFiles(null); setErr(null);
    browseDrive(cur.id).then((r) => { if (!alive) return; if (r.ok) setFiles(r.data as DriveFile[]); else setErr(r.error); });
    return () => { alive = false; };
  }, [connected, cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!folderId) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Aucun dossier Drive associé.</p>
        {canEdit && (
          <>
            {target === "episode" && <Button variant="gold" disabled={!connected} loading={pending} onClick={() => exec(() => createDriveFolderForEpisode(id))}><FolderPlus className="size-4" />Créer le dossier de l&apos;épisode</Button>}
            <div className="flex gap-2">
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Coller le lien d'un dossier existant" />
              <Button disabled={!link} onClick={() => exec(() => linkDriveFolder(target, id, link), { onSuccess: () => setLink("") })}><Link2 className="size-4" /></Button>
            </div>
          </>
        )}
        {!connected && <p className="text-xs text-muted">Google Drive n&apos;est pas encore connecté (Paramètres → Intégrations). Vous pouvez déjà associer un dossier par son lien.</p>}
      </div>
    );
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {stack.length > 1 && <Button size="sm" variant="ghost" onClick={() => setStack(stack.slice(0, -1))}><ChevronLeft className="size-4" />Retour</Button>}
        <span className="text-sm text-soft">{stack.map((x) => x.name).join(" / ")}</span>
        <a href={folderUrl ?? `https://drive.google.com/drive/folders/${folderId}`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-gold"><ExternalLink className="size-4" />Ouvrir dans Drive</a>
      </div>
      {!connected ? <p className="text-sm text-muted">Connectez Google Drive pour parcourir les rushs, audios, montages et miniatures directement ici.</p>
        : err ? <p className="text-sm text-alert">{err}</p>
        : files === null ? <div className="focus-line w-32 rounded-full" />
        : files.length === 0 ? <p className="text-sm text-muted">Dossier vide.</p>
        : (
          <ul className="flex flex-col gap-1">
            {files.map((f) => f.mimeType === "application/vnd.google-apps.folder" ? (
              <li key={f.id}><button onClick={() => setStack([...stack, { id: f.id, name: f.name }])} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2"><Folder className="size-4 text-gold" />{f.name}</button></li>
            ) : (
              <li key={f.id}><a href={f.webViewLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-panel-2"><FileText className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="hidden text-xs text-muted sm:inline">{f.modifiedTime ? formatDate(f.modifiedTime) : ""}</span></a></li>
            ))}
          </ul>
        )}
      {connected && canEdit && cur && (
        <>
          <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size > MAX_UPLOAD_BYTES) toast(`« ${f.name} » dépasse 15 Mo : pour les rushs et exports volumineux, déposez-le directement dans Google Drive (bouton « Ouvrir dans Drive »).`, "error"); else if (f) { const fd = new FormData(); fd.set("folderId", cur.id); fd.set("file", f); exec(() => uploadToDrive(fd), { onSuccess: () => setStack([...stack]) }); } e.target.value = ""; }} />
          <Button size="sm" className="mt-3" loading={pending} onClick={() => fileInput.current?.click()}><Upload className="size-4" />Envoyer un document ici</Button>
        </>
      )}
    </div>
  );
}
