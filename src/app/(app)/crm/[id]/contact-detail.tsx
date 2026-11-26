"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, Archive, ArchiveRestore, Trash2, Sparkles, MessageSquarePlus, Pencil, FolderOpen, Plus, Globe } from "lucide-react";
import { Avatar, Badge, Button, Card, Checkbox, ConfirmButton, Field, Input, Modal, SectionTitle, Select, Textarea, useAction, ExternalLink } from "@/components/ui";
import { ContactForm, type ContactFormValue } from "@/components/crm/contact-form";
import { GuestDocs, type GuestDocView } from "@/components/crm/guest-docs";
import { Attachments } from "@/components/attachments";
import { TaskCard, type TaskView } from "@/components/tasks/task-card";
import { confirmGuest, createContactTask, deleteContact, logInteraction, moveContact, setArchived } from "@/actions/crm";
import { CONTACT_CATEGORY, CONTACT_CATEGORY_ORDER, EPISODE_STAGE, INTERACTION_TYPE, PRIORITY, type EpisodeStage } from "@/lib/labels";
import { formatDate, relativeDay, todayISO } from "@/lib/dates";
import type { AttachmentView } from "@/lib/queries";
import type { Socials } from "@/lib/db/schema";

type C = {
  id: string; firstName: string; lastName: string; profession: string | null; company: string | null; email: string | null; phone: string | null;
  socials: Socials; category: "a_contacter" | "mail_envoye" | "a_relancer" | "invite_recu"; priority: "basse" | "normale" | "haute" | "urgente";
  ownerId: string | null; ownerName: string | null; whyInteresting: string | null; notes: string | null; lastContactAt: string | null; lastEmailSubject: string | null;
  responseReceived: boolean; followupCount: number; nextAction: string | null; nextFollowupAt: string | null; shootDate: string | null; publishDate: string | null;
  episodeUrl: string | null; driveFolderUrl: string | null; archivedAt: string | null; createdAt: string; updatedAt: string;
};
type Interaction = { id: string; type: keyof typeof INTERACTION_TYPE; subject: string | null; body: string | null; occurredAt: string; userName: string | null };

const SOCIAL_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", x: "X", site: "Site" };
function socialUrl(k: string, v: string) {
  if (/^https?:\/\//.test(v)) return v;
  const h = v.replace(/^@/, "");
  return { instagram: `https://instagram.com/${h}`, tiktok: `https://www.tiktok.com/@${h}`, linkedin: `https://www.linkedin.com/in/${h}`, youtube: `https://youtube.com/@${h}`, x: `https://x.com/${h}`, site: `https://${h}` }[k] ?? v;
}

export function ContactDetail({ c, interactions, episodes, tasks, docs, files, users, perms, driveConnected, meId }: {
  c: C; interactions: Interaction[]; episodes: { id: string; title: string; number: number | null; stage: EpisodeStage }[];
  tasks: TaskView[]; docs: GuestDocView[]; files: AttachmentView[]; users: { id: string; label: string }[];
  perms: { edit: boolean; del: boolean; production: boolean; tasks: boolean }; driveConnected: boolean; meId: string;
}) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const [modal, setModal] = useState<null | "edit" | "echange" | "confirmer" | "tache">(null);
  const name = `${c.firstName} ${c.lastName}`.trim();
  const today = todayISO();
  const formValue: ContactFormValue = {
    id: c.id, firstName: c.firstName, lastName: c.lastName, profession: c.profession ?? "", company: c.company ?? "", email: c.email ?? "", phone: c.phone ?? "",
    socials: c.socials ?? {}, category: c.category, priority: c.priority, ownerId: c.ownerId ?? "", whyInteresting: c.whyInteresting ?? "", notes: c.notes ?? "",
    lastEmailSubject: c.lastEmailSubject ?? "", nextAction: c.nextAction ?? "", nextFollowupAt: c.nextFollowupAt ?? "", shootDate: c.shootDate ?? "",
    publishDate: c.publishDate ?? "", episodeUrl: c.episodeUrl ?? "", driveFolderUrl: c.driveFolderUrl ?? "", responseReceived: c.responseReceived,
  };

  return (
    <div className="lights-up">
      <Link href="/crm" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold"><ArrowLeft className="size-4" />Invités & CRM</Link>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="tag-gold">{CONTACT_CATEGORY[c.category]}</span>
            {c.archivedAt && <Badge tone="muted">Archivé</Badge>}
            <Badge tone={c.priority === "urgente" ? "alert" : c.priority === "haute" ? "gold" : "neutral"}>Priorité {PRIORITY[c.priority].toLowerCase()}</Badge>
          </div>
          <h1 className="display text-3xl md:text-4xl">{name}</h1>
          <p className="mt-2 text-soft">{[c.profession, c.company].filter(Boolean).join(" · ") || "Profession à renseigner"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.edit && c.category !== "invite_recu" && perms.production && <Button variant="gold" onClick={() => setModal("confirmer")}><Sparkles className="size-4" />Confirmer l&apos;invité</Button>}
          {perms.edit && <Button onClick={() => setModal("echange")}><MessageSquarePlus className="size-4" />Enregistrer un échange</Button>}
          {perms.edit && <Button variant="ghost" onClick={() => setModal("edit")}><Pencil className="size-4" />Modifier</Button>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          {c.whyInteresting && (
            <Card className="p-5">
              <div className="eyebrow mb-2">Pourquoi cette personne</div>
              <p className="quote text-xl leading-snug text-cream">{c.whyInteresting}</p>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle title="Historique des échanges" action={perms.edit && <Button size="sm" onClick={() => setModal("echange")}><Plus className="size-3.5" />Échange</Button>} />
            <ol className="relative ml-2 border-l border-line">
              {interactions.length === 0 && <li className="pl-5 text-sm text-muted">Aucun échange enregistré.</li>}
              {interactions.map((i) => (
                <li key={i.id} className="relative mb-5 pl-5 last:mb-0">
                  <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-ink bg-gold" />
                  <div className="text-xs text-muted">{formatDate(i.occurredAt)} · {i.userName ?? "—"}</div>
                  <div className="mt-0.5 text-sm"><span className="font-semibold">{INTERACTION_TYPE[i.type]}</span>{i.subject && <> — {i.subject}</>}</div>
                  {i.body && <p className="mt-1 whitespace-pre-wrap text-sm text-soft">{i.body}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Tâches associées" action={perms.tasks && <Button size="sm" onClick={() => setModal("tache")}><Plus className="size-3.5" />Tâche</Button>} />
            <div className="grid gap-2 md:grid-cols-2">
              {tasks.length === 0 && <p className="text-sm text-muted">Aucune tâche liée.</p>}
              {tasks.map((t) => <TaskCard key={t.id} t={t} canEdit={perms.tasks} onOpen={() => router.push(`/missions?espace=tout&tache=${t.id}`)} compact />)}
            </div>
          </Card>

          <Card className="p-5" id="documents">
            <SectionTitle title="Autorisations & documents administratifs" />
            <GuestDocs docs={docs} contactId={c.id} episodeId={episodes[0]?.id ?? null} canEdit={perms.production} />
          </Card>

          <Card className="p-5">
            <SectionTitle title="Documents associés" />
            <Attachments entityType="contact" entityId={c.id} items={files} canEdit={perms.edit} />
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="p-5">
            <div className="eyebrow mb-3">Coordonnées</div>
            <div className="flex flex-col gap-2 text-sm">
              {c.email ? <a href={`mailto:${c.email}`} className="flex items-center gap-2 break-all hover:text-gold"><Mail className="size-4 text-muted" />{c.email}</a> : <span className="text-muted">E-mail non renseigné</span>}
              {c.phone ? <a href={`tel:${c.phone}`} className="flex items-center gap-2 hover:text-gold"><Phone className="size-4 text-muted" />{c.phone}</a> : <span className="text-muted">Téléphone non renseigné</span>}
              {Object.entries(c.socials ?? {}).filter(([, v]) => v).map(([k, v]) => (
                <a key={k} href={socialUrl(k, v!)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-gold"><Globe className="size-4 text-muted" /><span className="text-muted">{SOCIAL_LABEL[k]}</span> {v}</a>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="eyebrow mb-3">Suivi</div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Responsable</dt><dd className="mt-1 flex items-center gap-2"><Avatar name={c.ownerName} size={20} />{c.ownerName ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Dernier contact</dt><dd className="mt-1">{formatDate(c.lastContactAt)}</dd></div>
              <div><dt className="text-xs text-muted">Relances</dt><dd className="mt-1">{c.followupCount}</dd></div>
              <div><dt className="text-xs text-muted">Prochaine relance</dt><dd className={`mt-1 ${c.nextFollowupAt && c.nextFollowupAt <= today ? "font-semibold text-alert" : ""}`}>{c.nextFollowupAt ? `${formatDate(c.nextFollowupAt)} (${relativeDay(c.nextFollowupAt)})` : "—"}</dd></div>
              <div><dt className="text-xs text-muted">Réponse</dt><dd className="mt-1">{c.responseReceived ? "Reçue" : "En attente"}</dd></div>
              <div><dt className="text-xs text-muted">Dernier objet</dt><dd className="mt-1 line-clamp-2">{c.lastEmailSubject ?? "—"}</dd></div>
              {c.nextAction && <div className="col-span-2"><dt className="text-xs text-muted">Prochaine action</dt><dd className="mt-1">{c.nextAction}</dd></div>}
              {c.category === "invite_recu" && <>
                <div><dt className="text-xs text-muted">Tournage</dt><dd className="mt-1">{formatDate(c.shootDate)}</dd></div>
                <div><dt className="text-xs text-muted">Publication</dt><dd className="mt-1">{formatDate(c.publishDate)}</dd></div>
                {c.episodeUrl && <div className="col-span-2"><dt className="text-xs text-muted">Épisode</dt><dd className="mt-1"><ExternalLink href={c.episodeUrl}>{c.episodeUrl}</ExternalLink></dd></div>}
              </>}
            </dl>
            {perms.edit && (
              <Field label="Déplacer vers" className="mt-4">
                <Select value={c.category} onChange={(e) => exec(() => moveContact(c.id, e.target.value as C["category"]))}>
                  {CONTACT_CATEGORY_ORDER.map((k) => <option key={k} value={k}>{CONTACT_CATEGORY[k]}</option>)}
                </Select>
              </Field>
            )}
          </Card>

          <Card className="p-5">
            <div className="eyebrow mb-3">Épisodes</div>
            {episodes.length === 0 ? <p className="text-sm text-muted">Aucun épisode associé.</p> : episodes.map((e) => (
              <Link key={e.id} href={`/production/${e.id}`} className="mb-2 block rounded-lg border border-line px-3 py-2 hover:border-gold">
                <div className="text-sm font-medium">{e.number ? `Ép. ${String(e.number).padStart(2, "0")} — ` : ""}{e.title}</div>
                <div className="text-xs text-muted">{EPISODE_STAGE[e.stage]}</div>
              </Link>
            ))}
          </Card>

          <Card className="p-5">
            <div className="eyebrow mb-3">Google Drive</div>
            {c.driveFolderUrl
              ? <a href={c.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gold"><FolderOpen className="size-4" />Ouvrir le dossier de l&apos;invité</a>
              : <p className="text-sm text-muted">Aucun dossier associé. {perms.edit && "Collez son lien via « Modifier »."}</p>}
            {!driveConnected && <p className="mt-2 text-xs text-muted">Drive non connecté : les liens restent utilisables, l&apos;exploration des fichiers sera disponible après connexion (Paramètres → Intégrations).</p>}
          </Card>

          {perms.edit && (
            <div className="flex flex-wrap gap-2">
              <ConfirmButton variant="outline" message={c.archivedAt ? "Restaurer ce contact ?" : "Archiver ce contact ? Il disparaîtra des listes actives mais son historique est conservé."} confirmLabel={c.archivedAt ? "Restaurer" : "Archiver"}
                onConfirm={() => exec(() => setArchived(c.id, !c.archivedAt))}>
                {c.archivedAt ? <><ArchiveRestore className="size-4" />Restaurer</> : <><Archive className="size-4" />Archiver</>}
              </ConfirmButton>
              {perms.del && <ConfirmButton message={`Supprimer définitivement ${name} et tout son historique ? Préférez l'archivage si vous hésitez.`} confirmLabel="Supprimer définitivement"
                onConfirm={() => exec(() => deleteContact(c.id), { onSuccess: () => router.push("/crm") })}><Trash2 className="size-4" />Supprimer</ConfirmButton>}
            </div>
          )}
        </aside>
      </div>

      <Modal open={modal === "edit"} onClose={() => setModal(null)} title={`Modifier — ${name}`} wide>
        <ContactForm value={formValue} users={users} onDone={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "echange"} onClose={() => setModal(null)} title="Enregistrer un échange">
        <InteractionForm contactId={c.id} onDone={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "tache"} onClose={() => setModal(null)} title={`Tâche liée à ${name}`}>
        <QuickTask contactId={c.id} users={users} meId={meId} onDone={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "confirmer"} onClose={() => setModal(null)} title={`${name} a dit oui`} wide>
        <ConfirmGuestForm c={c} users={users} meId={meId} hasEpisode={episodes.length > 0} driveConnected={driveConnected} pending={pending}
          onSubmit={(v) => exec(() => confirmGuest(c.id, v), { onSuccess: (r) => { setModal(null); const id = (r as { data?: { episodeId?: string } }).data?.episodeId; if (id) router.push(`/production/${id}`); } })} />
      </Modal>
    </div>
  );
}

function InteractionForm({ contactId, onDone }: { contactId: string; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [v, setV] = useState({ type: "mail_envoye", subject: "", body: "", occurredOn: todayISO(), nextFollowupAt: "", nextAction: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); exec(() => logInteraction(contactId, v as Parameters<typeof logInteraction>[1]), { onSuccess: onDone }); }}>
      <Field label="Type d'échange"><Select value={v.type} onChange={set("type")}>{Object.entries(INTERACTION_TYPE).filter(([k]) => k !== "changement_statut").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Date"><Input type="date" value={v.occurredOn} onChange={set("occurredOn")} /></Field>
      <Field label={v.type === "mail_envoye" ? "Objet du mail" : "Résumé"} className="sm:col-span-2"><Input value={v.subject} onChange={set("subject")} /></Field>
      <Field label="Détails" className="sm:col-span-2"><Textarea rows={3} value={v.body} onChange={set("body")} /></Field>
      <Field label="Prochaine relance" hint={["mail_envoye", "relance"].includes(v.type) ? "Par défaut : dans 7 jours" : undefined}><Input type="date" value={v.nextFollowupAt} onChange={set("nextFollowupAt")} /></Field>
      <Field label="Prochaine action"><Input value={v.nextAction} onChange={set("nextAction")} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Enregistrer</Button></div>
    </form>
  );
}

function QuickTask({ contactId, users, meId, onDone }: { contactId: string; users: { id: string; label: string }[]; meId: string; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [v, setV] = useState({ title: "", due: "", who: meId });
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); exec(() => createContactTask(contactId, v.title, v.due || null, v.who || null), { onSuccess: onDone }); }}>
      <Field label="Titre" required><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsable"><Select value={v.who} onChange={(e) => setV({ ...v, who: e.target.value })}><option value="">Tâche commune</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
        <Field label="Échéance"><Input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Créer</Button></div>
    </form>
  );
}

function ConfirmGuestForm({ c, users, meId, hasEpisode, driveConnected, pending, onSubmit }: {
  c: C; users: { id: string; label: string }[]; meId: string; hasEpisode: boolean; driveConnected: boolean; pending: boolean;
  onSubmit: (v: { createEpisode: boolean; episodeTitle?: string; shootDate?: string; shootTime?: string; shootLocation?: string; producerId?: string; createDrive: boolean }) => void;
}) {
  const [v, setV] = useState({ createEpisode: !hasEpisode, episodeTitle: `${c.firstName} ${c.lastName}`.trim(), shootDate: c.shootDate ?? "", shootTime: "10:00", shootLocation: "", producerId: meId, createDrive: driveConnected });
  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
      <p className="text-soft">Bonne nouvelle. Voici ce que le QG peut préparer automatiquement — rien n&apos;est créé en double, et tout reste modifiable ensuite.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de tournage"><Input type="date" value={v.shootDate} onChange={(e) => setV({ ...v, shootDate: e.target.value })} /></Field>
        <Field label="Heure"><Input type="time" value={v.shootTime} onChange={(e) => setV({ ...v, shootTime: e.target.value })} /></Field>
        <Field label="Lieu de tournage" className="sm:col-span-2"><Input value={v.shootLocation} onChange={(e) => setV({ ...v, shootLocation: e.target.value })} placeholder="Studio, Paris…" /></Field>
        <Field label="Responsable de production"><Select value={v.producerId} onChange={(e) => setV({ ...v, producerId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
        {!hasEpisode && <Field label="Titre provisoire de l'épisode"><Input value={v.episodeTitle} onChange={(e) => setV({ ...v, episodeTitle: e.target.value })} /></Field>}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-night p-4">
        {!hasEpisode ? <Checkbox checked={v.createEpisode} onChange={(x) => setV({ ...v, createEpisode: x })} label="Créer la fiche épisode" /> : <p className="text-sm text-muted">Une fiche épisode existe déjà : elle sera mise à jour.</p>}
        <p className="text-sm text-soft">Inclus : tâches préparatoires (questions, appel de préparation, autorisations, studio), checklist « Avant tournage », suivi des autorisations, événement de tournage au calendrier{v.shootDate ? "" : " (si une date est fixée)"}.</p>
        <Checkbox checked={v.createDrive} disabled={!driveConnected} onChange={(x) => setV({ ...v, createDrive: x })} label={driveConnected ? "Créer le dossier Google Drive (Rushs, Audio, Montages, Miniatures, Exports…)" : "Dossier Drive — Google Drive non connecté"} />
      </div>
      <div className="flex justify-end gap-2"><Button type="submit" variant="gold" loading={pending}>Lancer la production</Button></div>
    </form>
  );
}
