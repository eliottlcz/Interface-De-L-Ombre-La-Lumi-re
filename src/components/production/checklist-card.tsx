"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, Trash2, Copy, Plus, Pencil } from "lucide-react";
import { Badge, Button, Checkbox, ConfirmButton, IconButton, Input, Progress, useAction, cx } from "@/components/ui";
import { addChecklistItem, deleteChecklist, deleteChecklistItem, duplicateChecklist, moveChecklistItem, renameChecklist, toggleChecklistItem, updateChecklistItem } from "@/actions/checklists";

export type ChecklistView = {
  id: string; name: string; phase: string; isTemplate: boolean; episodeId: string | null; episodeTitle: string | null;
  items: { id: string; label: string; done: boolean; doneByName: string | null }[];
};

export function ChecklistCard({ cl, canEdit, episodes }: { cl: ChecklistView; canEdit: boolean; episodes?: { id: string; label: string }[] }) {
  const { exec, pending } = useAction();
  const [newItem, setNewItem] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(cl.name);
  const [dupTarget, setDupTarget] = useState("");
  const done = cl.items.filter((i) => i.done).length;
  const pct = cl.items.length ? Math.round((100 * done) / cl.items.length) : 0;
  return (
    <div className="card lightable p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-1.5">
            {cl.isTemplate && <span className="tag-gold">Modèle</span>}
            <Badge tone="neutral">{cl.phase === "avant" ? "Avant tournage" : cl.phase === "apres" ? "Après tournage" : "Autre"}</Badge>
          </div>
          {editMode ? (
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== cl.name && exec(() => renameChecklist(cl.id, name))} className="mt-1" />
          ) : <h3 className="text-lg font-semibold">{cl.name}</h3>}
          {cl.episodeTitle && <Link href={`/production/${cl.episodeId}#checklists`} className="text-xs text-gold">{cl.episodeTitle}</Link>}
        </div>
        <div className="text-right">
          <div className={cx("display text-2xl", pct === 100 ? "text-gold" : "text-cream")}>{pct}%</div>
          <div className="text-[11px] text-muted">{done}/{cl.items.length}</div>
        </div>
      </div>
      <Progress value={pct} className="mt-3" />
      {pct === 100 && cl.items.length > 0 && !cl.isTemplate && <p className="mt-2 text-xs text-gold">Tout est prêt. Silence, on tourne.</p>}
      <ul className="mt-4 flex flex-col gap-1">
        {cl.items.map((it, i) => (
          <li key={it.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-panel-2">
            {editMode ? (
              <>
                <Input defaultValue={it.label} onBlur={(e) => e.target.value !== it.label && exec(() => updateChecklistItem(it.id, e.target.value))} className="h-9" />
                <IconButton label="Monter" disabled={i === 0} onClick={() => exec(() => moveChecklistItem(it.id, -1))}><ChevronUp className="size-4" /></IconButton>
                <IconButton label="Descendre" disabled={i === cl.items.length - 1} onClick={() => exec(() => moveChecklistItem(it.id, 1))}><ChevronDown className="size-4" /></IconButton>
                <IconButton label="Supprimer" onClick={() => exec(() => deleteChecklistItem(it.id))}><Trash2 className="size-4" /></IconButton>
              </>
            ) : (
              <>
                <Checkbox checked={it.done} disabled={!canEdit || cl.isTemplate} onChange={(v) => exec(() => toggleChecklistItem(it.id, v))}
                  label={<span className={cx(it.done && "text-muted line-through")}>{it.label}</span>} />
                {it.done && it.doneByName && <span className="ml-auto hidden text-[11px] text-muted sm:inline">{it.doneByName}</span>}
              </>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); exec(() => addChecklistItem(cl.id, newItem), { onSuccess: () => setNewItem("") }); }}>
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Ajouter un élément…" className="h-9" />
            <Button size="sm" type="submit" disabled={!newItem.trim()} loading={pending}><Plus className="size-4" /></Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => setEditMode(!editMode)}><Pencil className="size-3.5" />{editMode ? "Terminer" : "Modifier"}</Button>
            {episodes && (
              <span className="flex items-center gap-1">
                <select value={dupTarget} onChange={(e) => setDupTarget(e.target.value)} className="h-8 rounded-full border border-line bg-night px-2 text-xs text-soft" aria-label="Dupliquer pour">
                  <option value="">Dupliquer…</option>
                  <option value="__template">comme nouveau modèle</option>
                  {episodes.map((e) => <option key={e.id} value={e.id}>pour {e.label}</option>)}
                </select>
                {dupTarget && <Button size="sm" variant="gold" onClick={() => exec(() => duplicateChecklist(cl.id, dupTarget === "__template" ? { asTemplate: true } : { episodeId: dupTarget }), { onSuccess: () => setDupTarget("") })}><Copy className="size-3.5" />OK</Button>}
              </span>
            )}
            <span className="ml-auto"><ConfirmButton size="sm" variant="ghost" message={`Supprimer la checklist « ${cl.name} » ?`} onConfirm={() => exec(() => deleteChecklist(cl.id))}><Trash2 className="size-3.5" /></ConfirmButton></span>
          </div>
        </>
      )}
    </div>
  );
}
