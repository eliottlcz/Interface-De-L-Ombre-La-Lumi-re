"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Table2, Columns3, CalendarDays, ListChecks, Film, ShieldAlert } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, Input, Modal, PageHeader, Progress, Segmented, Select, Checkbox, useAction } from "@/components/ui";
import { Kanban } from "@/components/kanban";
import { EpisodeForm, emptyEpisode } from "@/components/production/episode-form";
import { setEpisodeStage } from "@/actions/production";
import { EPISODE_STAGES, EPISODE_STAGE, stageIndex, type EpisodeStage } from "@/lib/labels";
import { formatDate, utcToParis } from "@/lib/dates";

export type EpisodeRow = {
  id: string; number: number | null; title: string; stage: EpisodeStage; guest: string | null; profession: string | null;
  producerId: string | null; producerName: string | null; shootDate: string | null; plannedPublishDate: string | null; publishedAt: string | null;
  archived: boolean; openTasks: number; contents: number; missingDocs: number;
};
export const epLabel = (e: { number: number | null; title: string }) => (e.number ? `Ép. ${String(e.number).padStart(2, "0")}` : null);

export function ProductionView({ episodes, users, contacts, meId, canEdit, initialCreate }: { episodes: EpisodeRow[]; users: { id: string; label: string }[]; contacts: { id: string; label: string }[]; meId: string; canEdit: boolean; initialCreate: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const view = (sp.get("vue") ?? "kanban") as "kanban" | "tableau";
  const [stage, setStage] = useState("");
  const [producer, setProducer] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(initialCreate);
  const { exec } = useAction();

  const list = useMemo(() => episodes.filter((e) =>
    (showArchived || !e.archived) && (!stage || e.stage === stage) && (!producer || e.producerId === producer) &&
    (!from || (e.shootDate && utcToParis(e.shootDate).date >= from) || (e.plannedPublishDate && e.plannedPublishDate >= from)) &&
    (!to || (e.shootDate && utcToParis(e.shootDate).date <= to) || (e.plannedPublishDate && e.plannedPublishDate <= to))), [episodes, stage, producer, from, to, showArchived]);

  const setView = (v: string) => { const p = new URLSearchParams(sp.toString()); p.set("vue", v); p.delete("nouveau"); router.replace(`${pathname}?${p}`, { scroll: false }); };

  return (
    <div>
      <PageHeader eyebrow="Production" title="Du premier contact à la lumière"
        description="Douze étapes, de l'invité identifié à la promotion terminée. Valider une étape déclenche automatiquement la suite."
        actions={canEdit && <Button variant="gold" onClick={() => setCreating(true)}><Plus className="size-4" />Créer un épisode</Button>} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="h-10 w-auto" aria-label="Statut">
          <option value="">Toutes les étapes</option>{EPISODE_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select value={producer} onChange={(e) => setProducer(e.target.value)} className="h-10 w-auto" aria-label="Responsable">
          <option value="">Tous responsables</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </Select>
        <span className="flex items-center gap-1 text-xs text-muted">Du <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-[150px]" aria-label="Date de début" /> au <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-[150px]" aria-label="Date de fin" /></span>
        <Checkbox checked={showArchived} onChange={setShowArchived} label="Archivés" />
        <div className="ml-auto"><Segmented value={view} onChange={setView} items={[{ value: "kanban", label: <span className="inline-flex items-center gap-1"><Columns3 className="size-3.5" />Kanban</span> }, { value: "tableau", label: <span className="inline-flex items-center gap-1"><Table2 className="size-3.5" />Tableau</span> }]} /></div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Aucun épisode en production" action={canEdit && <Button variant="gold" onClick={() => setCreating(true)}>Créer un épisode</Button>}>Les épisodes apparaissent ici dès qu&apos;un invité est confirmé depuis le CRM, ou en les créant directement.</EmptyState>
      ) : view === "kanban" ? (
        <Kanban
          columns={EPISODE_STAGES.map(([k, l], i) => ({ id: k, label: `${i + 1}. ${l}`, accent: k === "publication" }))}
          items={list.map((e) => ({ ...e, column: e.stage }))}
          disabled={!canEdit}
          onMove={(id, col) => exec(() => setEpisodeStage(id, col as EpisodeStage))}
          renderCard={(e) => (
            <div className="rounded-xl border border-line bg-night p-3">
              <Link href={`/production/${e.id}`} onPointerDown={(ev) => ev.stopPropagation()} className="block">
                <EpisodeCardBody e={e} />
              </Link>
              {canEdit && (
                <select aria-label="Passer à l'étape" value={e.stage} onPointerDown={(ev) => ev.stopPropagation()} onChange={(ev) => exec(() => setEpisodeStage(e.id, ev.target.value as EpisodeStage))}
                  className="mt-2 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-soft md:hidden">
                  {EPISODE_STAGES.map(([k, l], i) => <option key={k} value={k}>→ {i + 1}. {l}</option>)}
                </select>
              )}
            </div>
          )} />
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <tr><th className="px-4 py-3">Épisode</th><th className="px-4 py-3">Invité</th><th className="px-4 py-3">Étape</th><th className="px-4 py-3">Tournage</th><th className="px-4 py-3">Publication</th><th className="px-4 py-3">Responsable</th><th className="px-4 py-3">Suivi</th></tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} onClick={() => router.push(`/production/${e.id}`)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2">
                    <td className="px-4 py-3"><div className="flex items-center gap-2">{epLabel(e) && <span className="tag-gold">{epLabel(e)}</span>}<span className="font-medium">{e.title}</span></div></td>
                    <td className="px-4 py-3"><div>{e.guest ?? "—"}</div><div className="text-xs text-muted">{e.profession}</div></td>
                    <td className="px-4 py-3 min-w-[180px]"><div className="text-xs">{stageIndex(e.stage) + 1}/12 · {EPISODE_STAGE[e.stage]}</div><Progress value={((stageIndex(e.stage) + 1) / 12) * 100} className="mt-1.5" /></td>
                    <td className="px-4 py-3">{e.shootDate ? formatDate(e.shootDate) : "—"}</td>
                    <td className="px-4 py-3">{e.publishedAt ? <Badge tone="ok">Publié {formatDate(e.publishedAt)}</Badge> : formatDate(e.plannedPublishDate)}</td>
                    <td className="px-4 py-3"><span className="flex items-center gap-2"><Avatar name={e.producerName} size={20} />{e.producerName ?? "—"}</span></td>
                    <td className="px-4 py-3"><Facts e={e} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            {list.map((e) => <Link key={e.id} href={`/production/${e.id}`} className="rounded-xl border border-line bg-panel p-4"><EpisodeCardBody e={e} /><Progress value={((stageIndex(e.stage) + 1) / 12) * 100} className="mt-3" /></Link>)}
          </div>
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nouvel épisode" wide>
        <EpisodeForm value={emptyEpisode(meId)} users={users} contacts={contacts} onDone={(id) => { setCreating(false); if (id) router.push(`/production/${id}`); }} />
      </Modal>
    </div>
  );
}

function EpisodeCardBody({ e }: { e: EpisodeRow }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {epLabel(e) && <span className="tag-gold mb-1.5">{epLabel(e)}</span>}
          <div className="font-semibold leading-snug">{e.title}</div>
          <div className="truncate text-xs text-muted">{[e.guest, e.profession].filter(Boolean).join(" · ") || "Invité à associer"}</div>
        </div>
        <Avatar name={e.producerName} size={22} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        {e.shootDate && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{formatDate(e.shootDate, { day: "numeric", month: "short" })}</span>}
        <span className="md:hidden">{EPISODE_STAGE[e.stage]}</span>
        <Facts e={e} />
      </div>
    </>
  );
}
function Facts({ e }: { e: EpisodeRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-muted">
      {e.openTasks > 0 && <span className="inline-flex items-center gap-1"><ListChecks className="size-3" />{e.openTasks}</span>}
      {e.contents > 0 && <span className="inline-flex items-center gap-1"><Film className="size-3" />{e.contents}</span>}
      {e.missingDocs > 0 && <span className="inline-flex items-center gap-1 text-gold"><ShieldAlert className="size-3" />{e.missingDocs}</span>}
    </span>
  );
}
