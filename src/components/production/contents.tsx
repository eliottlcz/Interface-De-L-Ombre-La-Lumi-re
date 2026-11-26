"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink as Ext, Trash2 } from "lucide-react";
import { Avatar, Badge, Button, ConfirmButton, EmptyState, Field, Input, Modal, Select, useAction } from "@/components/ui";
import { deleteContent, saveContent, setContentStatus, type ContentInputT } from "@/actions/production";
import { CONTENT_KIND, CONTENT_KIND_PLATFORM, CONTENT_STATUS } from "@/lib/labels";
import { formatDate, todayISO } from "@/lib/dates";

export type ContentView = {
  id: string; episodeId: string | null; episodeTitle: string | null; kind: keyof typeof CONTENT_KIND; title: string; platform: string;
  ownerId: string | null; ownerName: string | null; status: keyof typeof CONTENT_STATUS; plannedDate: string | null; fileUrl: string | null; publicationUrl: string | null;
};
const statusTone = (s: ContentView["status"]) => (s === "publie" ? "ok" : s === "programme" ? "gold" : s === "a_valider" ? "alert" : s === "en_montage" ? "olive" : "neutral");

export function ContentsList({ items, users, episodes, canEdit, episodeId, showEpisode, startNew }: {
  items: ContentView[]; users: { id: string; label: string }[]; episodes?: { id: string; label: string }[]; canEdit: boolean; episodeId?: string; showEpisode?: boolean; startNew?: boolean;
}) {
  const { exec } = useAction();
  const [edit, setEdit] = useState<ContentView | "new" | null>(startNew && canEdit ? "new" : null);
  const today = todayISO();
  return (
    <div>
      {items.length === 0 ? <EmptyState title="Aucune déclinaison" action={canEdit && <Button variant="gold" onClick={() => setEdit("new")}><Plus className="size-4" />Ajouter</Button>}>Épisode complet, audio, Shorts, Reels, TikTok, teaser, citations, promo…</EmptyState> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <tr><th className="px-3 py-2">Contenu</th>{showEpisode && <th className="px-3 py-2">Épisode</th>}<th className="px-3 py-2">Plateforme</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Date prévue</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2">Liens</th></tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-panel-2">
                    <td className="px-3 py-2.5"><button onClick={() => setEdit(c)} className="text-left hover:text-gold"><div className="font-medium">{c.title}</div><div className="text-xs text-muted">{CONTENT_KIND[c.kind]}</div></button></td>
                    {showEpisode && <td className="px-3 py-2.5">{c.episodeId ? <Link className="text-gold" href={`/production/${c.episodeId}#contenus`}>{c.episodeTitle}</Link> : "—"}</td>}
                    <td className="px-3 py-2.5">{c.platform}</td>
                    <td className="px-3 py-2.5"><span className="flex items-center gap-2"><Avatar name={c.ownerName} size={20} />{c.ownerName ?? "—"}</span></td>
                    <td className={`px-3 py-2.5 ${c.plannedDate && c.plannedDate < today && c.status !== "publie" ? "text-alert" : ""}`}>{formatDate(c.plannedDate)}</td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <select value={c.status} onChange={(e) => exec(() => setContentStatus(c.id, e.target.value as ContentView["status"]))} className="rounded-full border border-line bg-night px-2 py-1 text-xs" aria-label="Statut">
                          {Object.entries(CONTENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      ) : <Badge tone={statusTone(c.status)}>{CONTENT_STATUS[c.status]}</Badge>}
                    </td>
                    <td className="px-3 py-2.5"><span className="flex gap-3 text-xs">{c.fileUrl && <a className="text-gold" href={c.fileUrl} target="_blank" rel="noopener noreferrer">Fichier</a>}{c.publicationUrl && <a className="text-gold" href={c.publicationUrl} target="_blank" rel="noopener noreferrer">Publication</a>}{!c.fileUrl && !c.publicationUrl && "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            {items.map((c) => (
              <div key={c.id} className="rounded-xl border border-line bg-night p-3">
                <button onClick={() => setEdit(c)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2"><span className="font-medium">{c.title}</span><Badge tone={statusTone(c.status)}>{CONTENT_STATUS[c.status]}</Badge></div>
                  <div className="mt-1 text-xs text-muted">{CONTENT_KIND[c.kind]} · {c.platform} · {formatDate(c.plannedDate)} · {c.ownerName ?? "—"}</div>
                </button>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canEdit && <select value={c.status} onChange={(e) => exec(() => setContentStatus(c.id, e.target.value as ContentView["status"]))} className="h-9 rounded-full border border-line bg-panel px-3 text-xs" aria-label="Statut">
                    {Object.entries(CONTENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>}
                  {c.publicationUrl && <a href={c.publicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gold"><Ext className="size-3" />Publication</a>}
                </div>
              </div>
            ))}
          </div>
          {canEdit && <Button className="mt-4" onClick={() => setEdit("new")}><Plus className="size-4" />Ajouter un contenu</Button>}
        </>
      )}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "Nouveau contenu" : "Contenu"}>
        {edit !== null && <ContentForm value={edit === "new" ? null : edit} users={users} episodes={episodes} episodeId={episodeId} canEdit={canEdit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}

function ContentForm({ value, users, episodes, episodeId, canEdit, onDone }: { value: ContentView | null; users: { id: string; label: string }[]; episodes?: { id: string; label: string }[]; episodeId?: string; canEdit: boolean; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [v, setV] = useState({
    episodeId: value?.episodeId ?? episodeId ?? "", kind: value?.kind ?? "reel", title: value?.title ?? "", platform: value?.platform ?? "Instagram",
    ownerId: value?.ownerId ?? "", status: value?.status ?? "a_produire", plannedDate: value?.plannedDate ?? "", fileUrl: value?.fileUrl ?? "", publicationUrl: value?.publicationUrl ?? "",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); exec(() => saveContent(value?.id ?? null, v as ContentInputT), { onSuccess: onDone }); }}>
      <fieldset disabled={!canEdit} className="contents">
        <Field label="Format"><Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as ContentView["kind"], platform: CONTENT_KIND_PLATFORM[e.target.value as ContentView["kind"]] })}>{Object.entries(CONTENT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Plateforme"><Input value={v.platform} onChange={set("platform")} list="platforms" /></Field>
        <datalist id="platforms">{["YouTube", "Instagram", "TikTok", "Spotify", "Apple Podcasts", "Deezer", "Podcast", "Multi-plateforme", "LinkedIn"].map((p) => <option key={p} value={p} />)}</datalist>
        <Field label="Titre" required className="sm:col-span-2"><Input value={v.title} onChange={set("title")} required /></Field>
        {episodes && <Field label="Épisode d'origine" className="sm:col-span-2"><Select value={v.episodeId} onChange={set("episodeId")}><option value="">—</option>{episodes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></Field>}
        <Field label="Responsable"><Select value={v.ownerId} onChange={set("ownerId")}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
        <Field label="Statut"><Select value={v.status} onChange={set("status")}>{Object.entries(CONTENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Date prévue"><Input type="date" value={v.plannedDate} onChange={set("plannedDate")} /></Field>
        <Field label="Lien vers le fichier (Drive…)"><Input type="url" value={v.fileUrl} onChange={set("fileUrl")} /></Field>
        <Field label="Lien vers la publication" className="sm:col-span-2" hint={v.status === "publie" ? "Obligatoire pour « Publié »" : undefined}><Input type="url" value={v.publicationUrl} onChange={set("publicationUrl")} /></Field>
      </fieldset>
      <div className="flex justify-between gap-2 sm:col-span-2">
        {value && canEdit ? <ConfirmButton variant="ghost" message="Supprimer ce contenu ?" onConfirm={() => exec(() => deleteContent(value.id), { onSuccess: onDone })}><Trash2 className="size-4" /></ConfirmButton> : <span />}
        <span className="flex gap-2"><Button type="button" variant="ghost" onClick={onDone}>Fermer</Button>{canEdit && <Button type="submit" variant="gold" loading={pending}>Enregistrer</Button>}</span>
      </div>
    </form>
  );
}
