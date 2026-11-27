"use client";
import { useState } from "react";
import { Search, FileText, Folder } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { searchDriveFiles } from "@/actions/drive";
import type { DriveFile } from "@/lib/integrations/drive";

export function DriveSearch() {
  const [q, setQ] = useState(""); const [res, setRes] = useState<DriveFile[] | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <div>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); const r = await searchDriveFiles(q); setBusy(false); if (r.ok) setRes(r.data as DriveFile[]); else setErr(r.error); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom de fichier ou de dossier…" />
        <Button type="submit" loading={busy}><Search className="size-4" /></Button>
      </form>
      {err && <p className="mt-2 text-sm text-alert">{err}</p>}
      {res && (res.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun résultat.</p> : (
        <ul className="mt-3 flex flex-col gap-1">{res.map((f) => (
          <li key={f.id}><a href={f.webViewLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-panel-2">{f.mimeType.endsWith("folder") ? <Folder className="size-4 text-gold" /> : <FileText className="size-4 text-muted" />}{f.name}</a></li>
        ))}</ul>
      ))}
    </div>
  );
}
