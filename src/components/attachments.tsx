"use client";
import { useRef, useState } from "react";
import { Paperclip, Link2, Trash2, FileText, ExternalLink } from "lucide-react";
import { Button, Input, useAction, ConfirmButton } from "@/components/ui";
import { addLinkAttachment, deleteAttachment, uploadAttachment } from "@/actions/attachments";
import type { AttachmentView } from "@/lib/queries";
import { timeAgo } from "@/lib/dates";

export function Attachments({ entityType, entityId, items, canEdit }: { entityType: string; entityId: string; items: AttachmentView[]; canEdit: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const { pending, exec } = useAction();
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  return (
    <div>
      <ul className="flex flex-col gap-1">
        {items.length === 0 && <li className="text-sm text-muted">Aucun document.</li>}
        {items.map((a) => (
          <li key={a.id} className="group flex items-center gap-3 rounded-lg border border-line bg-night px-3 py-2">
            {a.url ? <ExternalLink className="size-4 shrink-0 text-gold" /> : <FileText className="size-4 shrink-0 text-gold" />}
            <a href={a.url ?? `/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm hover:text-gold">{a.filename}</a>
            <span className="hidden text-[11px] text-muted sm:inline">{a.size ? `${Math.round(a.size / 1024)} Ko · ` : ""}{timeAgo(a.createdAt)}</span>
            {canEdit && (
              <ConfirmButton size="sm" variant="ghost" message={`Supprimer « ${a.filename} » ?`} onConfirm={() => exec(() => deleteAttachment(a.id))}>
                <Trash2 className="size-4" />
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={file} type="file" multiple hidden onChange={(e) => {
            const fd = new FormData(); fd.set("entityType", entityType); fd.set("entityId", entityId);
            for (const f of Array.from(e.target.files ?? [])) fd.append("file", f);
            exec(() => uploadAttachment(fd)); e.target.value = "";
          }} />
          <Button size="sm" loading={pending} onClick={() => file.current?.click()}><Paperclip className="size-4" />Joindre un fichier</Button>
          <Button size="sm" variant="ghost" onClick={() => setLink(link ? null : { name: "", url: "" })}><Link2 className="size-4" />Ajouter un lien (Drive…)</Button>
        </div>
      )}
      {link && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Nom" value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} className="sm:w-48" />
          <Input placeholder="https://drive.google.com/…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
          <Button variant="gold" disabled={!link.url} onClick={() => exec(() => addLinkAttachment({ entityType, entityId, ...link }), { onSuccess: () => setLink(null) })}>Ajouter</Button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">Fichiers ≤ 15 Mo stockés en privé. Vidéos et fichiers lourds : sur Google Drive (ajoutez le lien).</p>
    </div>
  );
}
