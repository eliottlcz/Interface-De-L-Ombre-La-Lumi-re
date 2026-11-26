"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, useAction } from "@/components/ui";
import { ChecklistCard, type ChecklistView } from "@/components/production/checklist-card";
import { createChecklist } from "@/actions/checklists";

export function ChecklistsView({ templates, active, episodes, canEdit }: { templates: ChecklistView[]; active: ChecklistView[]; episodes: { id: string; label: string }[]; canEdit: boolean }) {
  const [tab, setTab] = useState<"tournages" | "modeles">(active.length ? "tournages" : "modeles");
  const [creating, setCreating] = useState(false);
  const { pending, exec } = useAction();
  const [v, setV] = useState({ name: "", phase: "avant", isTemplate: "1", episodeId: "", items: "" });
  const list = tab === "modeles" ? templates : active;
  return (
    <div>
      <PageHeader eyebrow="Checklists" title="Rien n'est laissé au hasard"
        description="Des modèles réutilisables, dupliqués pour chaque tournage. L'avancement se met à jour en temps réel pour toute l'équipe."
        actions={canEdit && <Button variant="gold" onClick={() => setCreating(true)}><Plus className="size-4" />Nouvelle checklist</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: "tournages", label: "Tournages", count: active.length }, { value: "modeles", label: "Modèles", count: templates.length }]} />
      {list.length === 0 ? <EmptyState title={tab === "modeles" ? "Aucun modèle" : "Aucune checklist de tournage"}>{tab === "tournages" ? "Elles sont créées automatiquement à la confirmation d'un invité, ou en dupliquant un modèle." : "Créez un modèle réutilisable."}</EmptyState>
        : <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{list.map((c) => <ChecklistCard key={c.id} cl={c} canEdit={canEdit} episodes={episodes} />)}</div>}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nouvelle checklist">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); exec(() => createChecklist({ name: v.name, phase: v.phase as "avant", isTemplate: v.isTemplate === "1", episodeId: v.isTemplate === "1" ? null : v.episodeId || null, items: v.items.split("\n") }), { onSuccess: () => { setCreating(false); setTab(v.isTemplate === "1" ? "modeles" : "tournages"); } }); }}>
          <Field label="Nom" required className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
          <Field label="Moment"><Select value={v.phase} onChange={(e) => setV({ ...v, phase: e.target.value })}><option value="avant">Avant tournage</option><option value="apres">Après tournage</option><option value="autre">Autre</option></Select></Field>
          <Field label="Type"><Select value={v.isTemplate} onChange={(e) => setV({ ...v, isTemplate: e.target.value })}><option value="1">Modèle réutilisable</option><option value="0">Pour un tournage</option></Select></Field>
          {v.isTemplate === "0" && <Field label="Épisode" className="sm:col-span-2"><Select value={v.episodeId} onChange={(e) => setV({ ...v, episodeId: e.target.value })}><option value="">—</option>{episodes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></Field>}
          <Field label="Éléments (un par ligne)" className="sm:col-span-2"><Textarea rows={6} value={v.items} onChange={(e) => setV({ ...v, items: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Créer</Button></div>
        </form>
      </Modal>
    </div>
  );
}
