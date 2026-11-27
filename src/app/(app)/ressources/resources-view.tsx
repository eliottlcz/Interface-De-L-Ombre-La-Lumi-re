"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Copy, ExternalLink, Lock, KeyRound, Pencil, Trash2, Download } from "lucide-react";
import { Badge, Button, Card, Checkbox, ConfirmButton, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, useAction, useToast } from "@/components/ui";
import { Attachments } from "@/components/attachments";
import { deleteResource, saveResource, type ResInputT } from "@/actions/resources";
import { RESOURCE_CATEGORIES, RESOURCE_SECTION } from "@/lib/labels";
import type { AttachmentView } from "@/lib/queries";
import { formatDate } from "@/lib/dates";

type Section = keyof typeof RESOURCE_SECTION;
export type ResourceRow = { id: string; section: Section; category: string | null; title: string; description: string | null; body: string | null; url: string | null; restricted: boolean; updatedAt: string; files: AttachmentView[] };

/** Charte relevée sur les visuels officiels du média (Ressources → Identité visuelle). */
const PALETTE = [["Noir", "#000000"], ["Or", "#DFC662"], ["Crème", "#F5F4F0"], ["Gris", "#8F8A80"], ["Rayure sombre", "#1B180C"], ["Olive", "#594F27"]];

export function ResourcesView({ resources, canEdit, canRestricted, canVault, initialCreate, openId }: { resources: ResourceRow[]; canEdit: boolean; canRestricted: boolean; canVault: boolean; initialCreate: boolean; openId: string | null }) {
  const initial = openId ? resources.find((r) => r.id === openId) : null;
  const [tab, setTab] = useState<Section>(initial?.section ?? "identite");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<ResourceRow | "new" | null>(initialCreate && canEdit ? "new" : null);
  const [view, setView] = useState<ResourceRow | null>(initial ?? null);
  const toast = useToast();
  const list = resources.filter((r) => r.section === tab && (!cat || r.category === cat));
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast("Copié dans le presse-papiers"); } catch { toast("Copie impossible sur cet appareil", "error"); } };

  return (
    <div>
      <PageHeader eyebrow="Ressources" title="La boîte à outils du média"
        description="Identité visuelle, documents, modèles de messages et savoir-faire de production — au même endroit."
        actions={<>
          {canVault && <Link href="/ressources/coffre-fort" className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm hover:border-gold"><KeyRound className="size-4 text-gold" />Coffre-fort</Link>}
          {canEdit && <Button variant="gold" onClick={() => setEdit("new")}><Plus className="size-4" />Ajouter une ressource</Button>}
        </>} />
      <Tabs value={tab} onChange={(v) => { setTab(v); setCat(""); }} className="mb-4" items={(Object.keys(RESOURCE_SECTION) as Section[]).map((k) => ({ value: k, label: RESOURCE_SECTION[k], count: resources.filter((r) => r.section === k).length }))} />
      <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <button onClick={() => setCat("")} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!cat ? "border-gold text-cream" : "border-line text-muted"}`}>Tout</button>
        {RESOURCE_CATEGORIES[tab].map((c) => <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${cat === c ? "border-gold text-cream" : "border-line text-muted"}`}>{c}</button>)}
      </div>

      {tab === "identite" && !cat && (
        <Card className="mb-6 overflow-hidden p-0">
          <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="flex items-center justify-center bg-gold p-8"><Image src="/brand/logo-tile.png" alt="Logo officiel De l'Ombre à la Lumière" width={180} height={180} /></div>
            <div className="p-6">
              <div className="tag-gold mb-3">Charte officielle</div>
              <p className="mb-4 text-sm text-soft">Relevée sur les visuels officiels du média. Le logo doré est la référence ; la typographie de titre est une grotesque large et très grasse, en capitales.</p>
              <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {PALETTE.map(([n, h]) => (
                  <button key={h} onClick={() => copy(h)} className="text-left" title={`Copier ${h}`}>
                    <span className="block h-12 rounded-lg border border-line" style={{ background: h }} />
                    <span className="mt-1 block text-xs">{n}</span><span className="block text-[11px] text-muted">{h}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <a href="/brand/logo-tile.png" download className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 hover:border-gold"><Download className="size-4" />Logo doré (PNG)</a>
                <a href="/brand/logo-stacked.png" download className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 hover:border-gold"><Download className="size-4" />Logo sur fond noir (PNG transparent)</a>
                <a href="/brand/logo-inline.png" download className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 hover:border-gold"><Download className="size-4" />Signature horizontale</a>
              </div>
              <p className="mt-4 text-xs text-muted">Titres : grotesque large extra-grasse (Archivo Expanded dans le QG) · Texte : Instrument Sans · Citations : serif italique (Instrument Serif). Les fichiers de police d&apos;origine des visuels restent à ajouter ici s&apos;ils diffèrent.</p>
            </div>
          </div>
        </Card>
      )}

      {list.length === 0 ? <EmptyState title="Rien ici pour l'instant" action={canEdit && <Button variant="gold" onClick={() => setEdit("new")}>Ajouter</Button>}>{tab === "communication" ? "Mails types, prospection, relances, refus, messages Instagram, scripts de contact." : "Ajoutez un lien Drive, un fichier ou un texte."}</EmptyState> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((r) => (
            <button key={r.id} onClick={() => setView(r)} className="card lightable flex flex-col p-4 text-left">
              <div className="mb-2 flex flex-wrap gap-1.5">{r.category && <Badge>{r.category}</Badge>}{r.restricted && <Badge tone="gold"><Lock className="size-3" />Restreint</Badge>}</div>
              <div className="font-semibold">{r.title}</div>
              {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>}
              {r.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-lg bg-night p-2 text-xs text-soft">{r.body}</p>}
              <div className="mt-auto pt-3 text-[11px] text-muted">{[r.url && "Lien", r.files.length && `${r.files.length} fichier(s)`, r.body && "Texte"].filter(Boolean).join(" · ")} · {formatDate(r.updatedAt)}</div>
            </button>
          ))}
        </div>
      )}

      <Modal open={view !== null} onClose={() => setView(null)} title={view?.title ?? ""} wide>
        {view && (
          <div className="flex flex-col gap-5">
            {view.description && <p className="text-soft">{view.description}</p>}
            {view.url && <a href={view.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-gold"><ExternalLink className="size-4" />Ouvrir {view.url.includes("google.com") ? "dans Google Drive" : "le lien"}</a>}
            {view.body && (
              <div>
                <div className="mb-2 flex items-center justify-between"><span className="eyebrow">Texte</span><Button size="sm" onClick={() => copy(view.body!)}><Copy className="size-3.5" />Copier</Button></div>
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-night p-4 font-sans text-sm leading-relaxed">{view.body}</pre>
              </div>
            )}
            <div><div className="eyebrow mb-2">Fichiers</div><Attachments entityType="resource" entityId={view.id} items={view.files} canEdit={canEdit} /></div>
            {canEdit && <div className="flex justify-end gap-2">
              <ConfirmButton variant="ghost" message={`Supprimer « ${view.title} » ?`} onConfirm={() => { setView(null); void deleteResource(view.id).then(() => location.reload()); }}><Trash2 className="size-4" /></ConfirmButton>
              <Button onClick={() => { setEdit(view); setView(null); }}><Pencil className="size-4" />Modifier</Button>
            </div>}
          </div>
        )}
      </Modal>
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "Nouvelle ressource" : "Modifier la ressource"} wide>
        {edit !== null && <ResourceForm init={edit === "new" ? null : edit} section={tab} canRestricted={canRestricted} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}

function ResourceForm({ init, section, canRestricted, onDone }: { init: ResourceRow | null; section: Section; canRestricted: boolean; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [v, setV] = useState({ section: init?.section ?? section, category: init?.category ?? RESOURCE_CATEGORIES[section][0], title: init?.title ?? "", description: init?.description ?? "", body: init?.body ?? "", url: init?.url ?? "", restricted: init?.restricted ?? false });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); exec(() => saveResource(init?.id ?? null, v as ResInputT), { onSuccess: onDone }); }}>
      <Field label="Rubrique"><Select value={v.section} onChange={(e) => setV({ ...v, section: e.target.value as Section, category: RESOURCE_CATEGORIES[e.target.value as Section][0] })}>{Object.entries(RESOURCE_SECTION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Catégorie"><Select value={v.category ?? ""} onChange={set("category")}>{RESOURCE_CATEGORIES[v.section].map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
      <Field label="Titre" required className="sm:col-span-2"><Input value={v.title} onChange={set("title")} required /></Field>
      <Field label="Description" className="sm:col-span-2"><Input value={v.description} onChange={set("description")} /></Field>
      <Field label="Lien (Google Drive, Canva…)" className="sm:col-span-2"><Input type="url" value={v.url} onChange={set("url")} /></Field>
      <Field label="Texte (modèle de mail, script…)" className="sm:col-span-2" hint="Copiable en un geste depuis la ressource."><Textarea rows={8} value={v.body} onChange={set("body")} /></Field>
      {canRestricted && <div className="sm:col-span-2"><Checkbox checked={v.restricted} onChange={(x) => setV({ ...v, restricted: x })} label="Ressource restreinte (contrats, documents administratifs)" /></div>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Enregistrer</Button></div>
      {!init && <p className="text-xs text-muted sm:col-span-2">Les fichiers se joignent après l&apos;enregistrement, depuis la ressource.</p>}
    </form>
  );
}
