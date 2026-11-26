"use client";
import { useMemo, useState } from "react";
import { Card, PageHeader, Select } from "@/components/ui";
import { ContentsList, type ContentView } from "@/components/production/contents";
import { CONTENT_KIND, CONTENT_STATUS } from "@/lib/labels";

export function ContentsPage({ items, users, episodes, canEdit, initialCreate }: { items: ContentView[]; users: { id: string; label: string }[]; episodes: { id: string; label: string }[]; canEdit: boolean; initialCreate: boolean }) {
  const [status, setStatus] = useState(""); const [kind, setKind] = useState(""); const [owner, setOwner] = useState(""); const [ep, setEp] = useState("");
  const list = useMemo(() => items.filter((c) => (!status || c.status === status) && (!kind || c.kind === kind) && (!owner || c.ownerId === owner) && (!ep || c.episodeId === ep)), [items, status, kind, owner, ep]);
  const counts = Object.keys(CONTENT_STATUS).map((k) => [k, items.filter((c) => c.status === k).length] as const);
  return (
    <div>
      <PageHeader eyebrow="Contenus" title="Un épisode, mille éclats"
        description="Toutes les déclinaisons : épisode complet, audio, Shorts, Reels, TikTok, teasers, citations, promos — et leur statut de publication." />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {counts.map(([k, n]) => (
          <button key={k} onClick={() => setStatus(status === k ? "" : k)} className={`card lightable p-3 text-left ${status === k ? "border-gold" : ""}`}>
            <div className="display text-2xl">{n}</div><div className="text-xs text-muted">{CONTENT_STATUS[k as keyof typeof CONTENT_STATUS]}</div>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 w-auto" aria-label="Format"><option value="">Tous formats</option>{Object.entries(CONTENT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-10 w-auto" aria-label="Responsable"><option value="">Tous responsables</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select>
        <Select value={ep} onChange={(e) => setEp(e.target.value)} className="h-10 w-auto max-w-[260px]" aria-label="Épisode"><option value="">Tous les épisodes</option>{episodes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select>
      </div>
      <Card className="p-4"><ContentsList items={list} users={users} episodes={episodes} canEdit={canEdit} showEpisode startNew={initialCreate} /></Card>
    </div>
  );
}
