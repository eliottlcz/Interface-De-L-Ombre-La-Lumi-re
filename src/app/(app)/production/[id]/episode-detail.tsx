"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pencil, Archive, ArchiveRestore, Trash2, Undo2, MapPin, CalendarDays, Clapperboard, Sparkles, Plus } from "lucide-react";
import { Avatar, Badge, Button, Card, Checkbox, ConfirmButton, Modal, SectionTitle, useAction, cx, ExternalLink } from "@/components/ui";
import { EpisodeForm, type EpisodeFormValue } from "@/components/production/episode-form";
import { ChecklistCard, type ChecklistView } from "@/components/production/checklist-card";
import { ContentsList, type ContentView } from "@/components/production/contents";
import { GuestDocs, type GuestDocView } from "@/components/crm/guest-docs";
import { Attachments } from "@/components/attachments";
import { DrivePanel } from "@/components/drive-panel";
import { TaskCard, type TaskView } from "@/components/tasks/task-card";
import { addEpisodeChecklist, deleteEpisode, prepareDeclinations, rollbackEpisodeStage, setEpisodeArchived, setEpisodeStage } from "@/actions/production";
import { EPISODE_STAGES, EPISODE_STAGE, EVENT_TYPE, stageIndex, type EpisodeStage } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { AttachmentView } from "@/lib/queries";

type E = Omit<EpisodeFormValue, "number" | "contactId" | "producerId"> & { id: string; number: number | null; contactId: string | null; producerId: string | null; stage: EpisodeStage; producerName: string | null; driveFolderId: string | null; publishedAt: string | null; archived: boolean };

/** Ce que chaque validation déclenche — annoncé avant confirmation. */
const STAGE_EFFECTS: Partial<Record<EpisodeStage, string[]>> = {
  confirme: ["Tâches préparatoires (questions, appel, autorisations, studio)", "Checklist « Avant tournage »", "Autorisations attendues", "Événement de tournage au calendrier (si date fixée)", "Fiche invité → « Invités reçus »"],
  preparation: ["Mêmes préparatifs que « Interview confirmée », sans doublon"],
  tournage_realise: ["L'épisode passe directement « Montage en cours »", "Tâches : montage, sauvegarde des rushs, remerciement de l'invité", "Checklist « Après tournage »", "Déclinaisons de contenu (YouTube, audio, Shorts, Reels, TikTok, teaser, citations, promo)", "Échéance de validation au calendrier (J+10)"],
  publication: ["Liens enregistrés et contenus principaux marqués publiés", "Fiche invité mise à jour (date et lien de publication)", "Tâches de suivi des statistiques J+7 et J+30", "Tâche de promotion", "Étapes précédentes archivées comme terminées"],
  promotion_terminee: ["La tâche de promotion est clôturée"],
};

export function EpisodeDetail({ e, guest, stages, tasks, docs, checklists, contents, files, events, users, contacts, episodes, driveConnected, perms }: {
  e: E; guest: { id: string; name: string; profession: string | null } | null; stages: { stage: EpisodeStage; at: string; by: string | null }[];
  tasks: TaskView[]; docs: GuestDocView[]; checklists: ChecklistView[]; contents: ContentView[]; files: AttachmentView[];
  events: { id: string; title: string; type: keyof typeof EVENT_TYPE; startsAt: string }[];
  users: { id: string; label: string }[]; contacts: { id: string; label: string }[]; episodes: { id: string; label: string }[];
  driveConnected: boolean; perms: { edit: boolean; del: boolean; tasks: boolean };
}) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<EpisodeStage | null>(null);
  const [createDrive, setCreateDrive] = useState(driveConnected && !e.driveFolderId);
  const [report, setReport] = useState<{ created: string[]; skipped: string[] } | null>(null);
  const cur = stageIndex(e.stage);
  const done = new Map(stages.map((x) => [x.stage, x]));
  const tag = e.number ? `Ép. ${String(e.number).padStart(2, "0")}` : "Épisode";

  return (
    <div className="lights-up">
      <Link href="/production" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold"><ArrowLeft className="size-4" />Production</Link>

      {/* En-tête inspiré des miniatures officielles : étiquette dorée + titre en capitales */}
      <header className="relative mb-8 overflow-hidden rounded-[18px] border border-line spotlight p-6 md:p-8">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap gap-2"><span className="tag-gold">{tag}</span>{e.archived && <Badge tone="muted">Archivé</Badge>}{e.publishedAt && <Badge tone="ok">Publié le {formatDate(e.publishedAt)}</Badge>}</div>
            <h1 className="display text-3xl leading-[0.95] md:text-5xl">{e.title}</h1>
            <p className="mt-3 text-soft">{guest ? <Link href={`/crm/${guest.id}`} className="hover:text-gold">{guest.name}{guest.profession && `, ${guest.profession}`}</Link> : "Invité à associer"}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" />{e.shootDay ? `Tournage le ${formatDate(e.shootDay)} à ${e.shootTime}` : "Date de tournage à fixer"}</span>
              {e.shootLocation && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{e.shootLocation}</span>}
              <span className="inline-flex items-center gap-1.5"><Avatar name={e.producerName} size={18} />{e.producerName ?? "Responsable à désigner"}</span>
              {e.plannedPublishDate && <span>Publication prévue le {formatDate(e.plannedPublishDate)}</span>}
            </div>
          </div>
          {perms.edit && <Button onClick={() => setEditing(true)}><Pencil className="size-4" />Modifier la fiche</Button>}
        </div>
      </header>

      {/* Étapes de production */}
      <Card className="mb-6 p-5">
        <SectionTitle eyebrow={`Étape ${cur + 1} sur 12`} title={EPISODE_STAGE[e.stage]} action={perms.edit && cur < 11 && <Button variant="gold" onClick={() => setTarget(EPISODE_STAGES[cur + 1][0])}><Check className="size-4" />Valider : {EPISODE_STAGES[cur + 1][1]}</Button>} />
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {EPISODE_STAGES.map(([k, l], i) => {
            const isDone = i <= cur; const st = done.get(k);
            return (
              <li key={k}>
                <button disabled={!perms.edit || i === cur} onClick={() => setTarget(k)}
                  className={cx("flex h-full w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition",
                    i === cur ? "border-gold bg-gold/10" : isDone ? "border-line bg-panel-2 hover:border-line-strong" : "border-dashed border-line hover:border-gold/60")}>
                  <span className={cx("flex size-6 items-center justify-center rounded-full text-[11px] font-bold", isDone ? "bg-gold text-black" : "border border-line-strong text-muted")}>{isDone ? <Check className="size-3.5" /> : i + 1}</span>
                  <span className={cx("text-[13px] leading-tight", isDone ? "text-cream" : "text-muted")}>{l}</span>
                  {st && <span className="text-[10px] text-muted">{formatDate(st.at, { day: "numeric", month: "short" })}{st.by ? ` · ${st.by.split(" ")[0]}` : ""}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card className="p-5" id="contenus">
            <SectionTitle title="Déclinaisons de contenu" action={perms.edit && <Button size="sm" onClick={() => exec(() => prepareDeclinations(e.id))}><Sparkles className="size-3.5" />Préparer toutes les déclinaisons</Button>} />
            <ContentsList items={contents} users={users} canEdit={perms.edit} episodeId={e.id} />
          </Card>

          <section id="checklists">
            <SectionTitle title="Checklists de tournage" action={perms.edit && <span className="flex gap-2">
              {!checklists.some((c) => c.phase === "avant") && <Button size="sm" onClick={() => exec(() => addEpisodeChecklist(e.id, "avant"))}><Plus className="size-3.5" />Avant</Button>}
              {!checklists.some((c) => c.phase === "apres") && <Button size="sm" onClick={() => exec(() => addEpisodeChecklist(e.id, "apres"))}><Plus className="size-3.5" />Après</Button>}
            </span>} />
            <div className="grid gap-4 lg:grid-cols-2">
              {checklists.length === 0 && <p className="text-sm text-muted">Aucune checklist associée à ce tournage.</p>}
              {checklists.map((c) => <ChecklistCard key={c.id} cl={c} canEdit={perms.edit} episodes={episodes} />)}
            </div>
          </section>

          <Card className="p-5">
            <SectionTitle title="Préparation de l'interview" />
            {e.prepNotes || e.interviewQuestions ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div><div className="eyebrow mb-2">Notes préparatoires</div><p className="whitespace-pre-wrap text-sm leading-relaxed text-soft">{e.prepNotes || "—"}</p></div>
                <div><div className="eyebrow mb-2">Questions</div><p className="whitespace-pre-wrap text-sm leading-relaxed">{e.interviewQuestions || "—"}</p></div>
              </div>
            ) : <p className="text-sm text-muted">On écoute avant de questionner : ajoutez les notes de l&apos;appel de préparation et les questions via « Modifier la fiche ».</p>}
          </Card>

          <Card className="p-5">
            <SectionTitle title="Tâches de l'épisode" />
            <div className="grid gap-2 md:grid-cols-2">
              {tasks.length === 0 && <p className="text-sm text-muted">Aucune tâche liée.</p>}
              {tasks.map((t) => <TaskCard key={t.id} t={t} canEdit={perms.tasks} onOpen={() => router.push(`/missions?espace=tout&tache=${t.id}`)} compact />)}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Autorisations de l'invité" action={<Link href="/crm/autorisations" className="text-xs text-gold">Tout le suivi</Link>} />
            <GuestDocs docs={docs} contactId={e.contactId || undefined} episodeId={e.id} canEdit={perms.edit} />
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="p-5">
            <div className="eyebrow mb-3">Google Drive</div>
            <DrivePanel target="episode" id={e.id} folderId={e.driveFolderId} folderUrl={e.driveFolderUrl || null} connected={driveConnected} canEdit={perms.edit} />
          </Card>

          <Card className="p-5">
            <div className="eyebrow mb-3">Liens</div>
            <dl className="flex flex-col gap-2 text-sm">
              {[["Vidéo", e.videoUrl], ["Audio", e.audioUrl], ["Graphisme", e.graphicsUrl], ["Administratif", e.adminDocsUrl], ...Object.entries(e.publicationLinks).map(([k, v]) => [`Publication ${k}`, v])].map(([k, v]) => (
                <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-muted">{k}</dt><dd className="min-w-0">{v ? <ExternalLink href={v}>{v}</ExternalLink> : "—"}</dd></div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <div className="eyebrow mb-3">Au calendrier</div>
            {events.length === 0 ? <p className="text-sm text-muted">Aucun événement.</p> : events.map((ev) => (
              <Link key={ev.id} href={`/calendrier?evenement=${ev.id}`} className="mb-2 flex items-center gap-3 rounded-lg border border-line px-3 py-2 hover:border-gold">
                <Clapperboard className="size-4 text-gold" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{ev.title}</span><span className="text-xs text-muted">{formatDateTime(ev.startsAt)}</span></span>
              </Link>
            ))}
          </Card>

          <Card className="p-5">
            <div className="eyebrow mb-3">Documents</div>
            <Attachments entityType="episode" entityId={e.id} items={files} canEdit={perms.edit} />
          </Card>

          {perms.edit && (
            <div className="flex flex-wrap gap-2">
              <ConfirmButton variant="outline" message={e.archived ? "Restaurer cet épisode ?" : "Archiver cet épisode ? Il ne sera plus affiché dans la production en cours."} confirmLabel={e.archived ? "Restaurer" : "Archiver"} onConfirm={() => exec(() => setEpisodeArchived(e.id, !e.archived))}>
                {e.archived ? <><ArchiveRestore className="size-4" />Restaurer</> : <><Archive className="size-4" />Archiver</>}
              </ConfirmButton>
              {perms.del && <ConfirmButton message={`Supprimer définitivement « ${e.title} », ses contenus, checklists et événements ?`} confirmLabel="Supprimer" onConfirm={() => exec(() => deleteEpisode(e.id), { onSuccess: () => router.push("/production") })}><Trash2 className="size-4" />Supprimer</ConfirmButton>}
            </div>
          )}
        </aside>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Fiche épisode" wide>
        <EpisodeForm full value={{ ...e, number: e.number ? String(e.number) : "", contactId: e.contactId ?? "", producerId: e.producerId ?? "" }} users={users} contacts={contacts} onDone={() => setEditing(false)} />
      </Modal>

      <Modal open={target !== null} onClose={() => setTarget(null)} title={target ? (stageIndex(target) > cur ? `Valider : ${EPISODE_STAGE[target]}` : `Revenir à : ${EPISODE_STAGE[target]}`) : ""}>
        {target && (stageIndex(target) > cur ? (
          <div className="flex flex-col gap-4">
            {target === "tournage_realise" && <p className="quote text-2xl text-gold">Coupez ! C&apos;est dans la boîte.</p>}
            {stageIndex(target) > cur + 1 && <p className="text-sm text-soft">Les étapes intermédiaires seront aussi marquées comme terminées.</p>}
            {STAGE_EFFECTS[target] ? (
              <div className="rounded-xl border border-line bg-night p-4">
                <div className="eyebrow mb-2">Le QG va préparer automatiquement</div>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-soft">{STAGE_EFFECTS[target]!.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="mt-2 text-xs text-muted">Rien n&apos;est créé en double si l&apos;élément existe déjà.</p>
              </div>
            ) : <p className="text-sm text-soft">Cette étape sera enregistrée avec votre nom et la date du jour.</p>}
            {(target === "confirme" || target === "preparation") && !e.driveFolderId && <Checkbox checked={createDrive} disabled={!driveConnected} onChange={setCreateDrive} label={driveConnected ? "Créer aussi le dossier Google Drive" : "Dossier Drive — Google Drive non connecté"} />}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setTarget(null)}>Annuler</Button>
              <Button variant="gold" loading={pending} onClick={() => exec(() => setEpisodeStage(e.id, target, { createDrive }), { onSuccess: (r) => { setTarget(null); const d = (r as { data?: { created: string[]; skipped: string[] } }).data; if (d && (d.created.length || d.skipped.length)) setReport(d); } })}>Valider l&apos;étape</Button></div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-soft">Revenir en arrière dévalide les étapes suivantes. Les tâches et contenus déjà créés sont conservés.</p>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setTarget(null)}>Annuler</Button><Button onClick={() => exec(() => rollbackEpisodeStage(e.id, target), { onSuccess: () => setTarget(null) })}><Undo2 className="size-4" />Revenir à cette étape</Button></div>
          </div>
        ))}
      </Modal>

      <Modal open={report !== null} onClose={() => setReport(null)} title="Compte-rendu des automatisations">
        {report && (
          <div className="flex flex-col gap-4 text-sm">
            {report.created.length > 0 && <div><div className="eyebrow mb-2">Créé</div><ul className="flex flex-col gap-1">{report.created.map((x, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-gold" />{x}</li>)}</ul></div>}
            {report.skipped.length > 0 && <div><div className="eyebrow mb-2">Déjà en place / non applicable</div><ul className="flex flex-col gap-1 text-muted">{report.skipped.map((x, i) => <li key={i}>· {x}</li>)}</ul></div>}
            <div className="flex justify-end"><Button variant="gold" onClick={() => setReport(null)}>Parfait</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
