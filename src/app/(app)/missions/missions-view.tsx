"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, List, Columns3, CalendarDays, History, Trash2, Send } from "lucide-react";
import { Avatar, Badge, Button, ConfirmButton, EmptyState, Modal, PageHeader, Segmented, Select, Tabs, Textarea, useAction, cx } from "@/components/ui";
import { Kanban } from "@/components/kanban";
import { MonthGrid } from "@/components/month-grid";
import { Attachments } from "@/components/attachments";
import { TaskCard, type TaskView, priorityTone } from "@/components/tasks/task-card";
import { TaskForm, emptyTask, type Opt, type TaskFormValue } from "@/components/tasks/task-form";
import { addTaskComment, deleteTask, setTaskStatus, updateTask } from "@/actions/tasks";
import { PRIORITY, PRIORITY_RANK, TASK_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, timeAgo, todayISO } from "@/lib/dates";
import type { AttachmentView } from "@/lib/queries";

type Detail = { comments: { id: string; body: string; createdAt: string; userName: string | null }[]; files: AttachmentView[] } | null;
type Props = {
  me: { id: string; name: string }; canEdit: boolean; canDeleteAll: boolean; tasks: TaskView[];
  users: Opt[]; episodes: Opt[]; contacts: Opt[]; openId: string | null; detail: Detail; initialCreate: boolean;
};
type View = "liste" | "kanban" | "calendrier" | "historique";

export function MissionsView({ me, canEdit, canDeleteAll, tasks, users, episodes, contacts, openId, detail, initialCreate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const space = sp.get("espace") ?? "moi";
  const view = (sp.get("vue") as View) ?? "liste";
  const [prio, setPrio] = useState("");
  const [who, setWho] = useState("");
  const [creating, setCreating] = useState<TaskFormValue | null>(initialCreate ? emptyTask(space === "communes" ? "" : space === "moi" || space === "tout" ? me.id : space) : null);
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { exec } = useAction();

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v === null) p.delete(k); else p.set(k, v);
    p.delete("nouveau");
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

  const inSpace = (t: TaskView) =>
    space === "moi" ? t.assigneeId === me.id : space === "communes" ? t.assigneeId === null : space === "tout" ? true : t.assigneeId === space;
  const filtered = useMemo(() => tasks
    .filter(inSpace)
    .filter((t) => !prio || t.priority === prio)
    .filter((t) => !who || (who === "commune" ? t.assigneeId === null : t.assigneeId === who))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tasks, space, prio, who, me.id]);
  const open = filtered.filter((t) => t.status !== "termine");
  const done = tasks.filter(inSpace).filter((t) => t.status === "termine").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const current = openId ? tasks.find((t) => t.id === openId) ?? null : null;

  const spaces = [
    { value: "moi", label: "Mes tâches", count: tasks.filter((t) => t.assigneeId === me.id && t.status !== "termine").length },
    ...users.filter((u) => u.id !== me.id).map((u) => ({ value: u.id, label: `Espace ${u.label.split(" ")[0]}`, count: tasks.filter((t) => t.assigneeId === u.id && t.status !== "termine").length })),
    { value: "communes", label: "Communes", count: tasks.filter((t) => !t.assigneeId && t.status !== "termine").length },
    { value: "tout", label: "Toutes", count: tasks.filter((t) => t.status !== "termine").length },
  ];
  const spaceOwner = space === "moi" ? me.id : space === "communes" || space === "tout" ? (space === "communes" ? "" : me.id) : space;
  const ownerName = users.find((u) => u.id === space)?.label;

  const openTask = (id: string) => setParam("tache", id);
  const groups: [string, TaskView[]][] = [
    ["En retard", open.filter((t) => t.dueDate && t.dueDate < todayISO())],
    ["Aujourd'hui", open.filter((t) => t.dueDate === todayISO())],
    ["À venir", open.filter((t) => t.dueDate && t.dueDate > todayISO())],
    ["Sans échéance", open.filter((t) => !t.dueDate)],
  ];

  return (
    <div>
      <PageHeader eyebrow="Mes missions" title={space === "moi" ? `Les missions de ${me.name.split(" ")[0]}` : space === "communes" ? "Tâches communes" : space === "tout" ? "Toutes les missions" : `Espace ${ownerName?.split(" ")[0] ?? ""}`}
        description={space !== "moi" && space !== "tout" && space !== "communes" ? `Ce que vous créez ici est attribué à ${ownerName?.split(" ")[0]} — il ou elle est prévenu(e) aussitôt.` : "Créez, attribuez, cochez : chaque modification apparaît instantanément chez toute l'équipe."}
        actions={canEdit && <Button variant="gold" onClick={() => setCreating(emptyTask(spaceOwner))}><Plus className="size-4" />Nouvelle tâche</Button>} />

      <Tabs value={space} onChange={(v) => setParam("espace", v)} items={spaces} />

      <div className="my-5 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={(v) => setParam("vue", v)} items={[
          { value: "liste", label: <span className="inline-flex items-center gap-1"><List className="size-3.5" />Liste</span> },
          { value: "kanban", label: <span className="inline-flex items-center gap-1"><Columns3 className="size-3.5" />Kanban</span> },
          { value: "calendrier", label: <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /><span className="hidden sm:inline">Calendrier</span></span> },
          { value: "historique", label: <span className="inline-flex items-center gap-1"><History className="size-3.5" /><span className="hidden sm:inline">Historique</span></span> },
        ]} />
        <div className="ml-auto flex gap-2">
          {space === "tout" && (
            <Select value={who} onChange={(e) => setWho(e.target.value)} className="h-9 w-auto text-sm" aria-label="Filtrer par responsable">
              <option value="">Tous les responsables</option><option value="commune">Communes</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          )}
          <Select value={prio} onChange={(e) => setPrio(e.target.value)} className="h-9 w-auto text-sm" aria-label="Filtrer par priorité">
            <option value="">Toutes priorités</option>
            {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
      </div>

      {view === "liste" && (open.length === 0
        ? <EmptyState title="Rien dans l'ombre pour l'instant" action={canEdit && <Button variant="gold" onClick={() => setCreating(emptyTask(spaceOwner))}>Créer une tâche</Button>}>Aucune tâche ouverte ici. Profitez-en, ou préparez la suite.</EmptyState>
        : <div className="flex flex-col gap-6">{groups.filter(([, l]) => l.length).map(([label, list]) => (
            <section key={label}>
              <div className={cx("eyebrow mb-2", label === "En retard" && "text-alert")}>{label} · {list.length}</div>
              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">{list.map((t) => <TaskCard key={t.id} t={t} canEdit={canEdit} onOpen={() => openTask(t.id)} />)}</div>
            </section>
          ))}</div>)}

      {view === "kanban" && (
        <Kanban
          columns={(Object.keys(TASK_STATUS) as TaskView["status"][]).map((k) => ({ id: k, label: TASK_STATUS[k], accent: k === "en_cours" }))}
          items={filtered.filter((t) => t.status !== "termine" || (t.completedAt ?? "") > new Date(Date.now() - 14 * 864e5).toISOString()).map((t) => ({ ...t, column: t.status }))}
          disabled={!canEdit}
          onMove={(id, col) => exec(() => setTaskStatus(id, col as TaskView["status"]))}
          renderCard={(t) => (
            <div>
              <TaskCard t={t} canEdit={canEdit} onOpen={() => openTask(t.id)} compact />
              {canEdit && (
                <select aria-label="Déplacer vers" value={t.status} onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => exec(() => setTaskStatus(t.id, e.target.value as TaskView["status"]))}
                  className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-soft md:hidden">
                  {Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>→ {l}</option>)}
                </select>
              )}
            </div>
          )}
        />
      )}

      {view === "calendrier" && (
        <MonthGrid month={month} onMonth={setMonth}
          items={filtered.filter((t) => t.dueDate).map((t) => ({ id: t.id, date: t.dueDate!, label: t.title, muted: t.status === "termine", color: t.priority === "urgente" ? "#e2725b" : t.priority === "haute" ? "#DFC662" : "#8F8A80" }))}
          onItem={openTask}
          onDay={canEdit ? (d) => setCreating({ ...emptyTask(spaceOwner), dueDate: d }) : undefined}
          onMove={canEdit ? (id, d) => {
            const t = tasks.find((x) => x.id === id)!;
            exec(() => updateTask(id, { title: t.title, description: t.description, assigneeId: t.assigneeId, priority: t.priority, status: t.status, dueDate: d, contactId: t.contactId, episodeId: t.episodeId }), { success: `Échéance déplacée au ${formatDate(d)}` });
          } : undefined} />
      )}

      {view === "historique" && (done.length === 0
        ? <EmptyState title="Pas encore de tâche terminée">Les tâches cochées apparaîtront ici, avec qui et quand.</EmptyState>
        : <Card2>{done.map((t) => (
            <button key={t.id} onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-panel-2">
              <span className="text-gold">✓</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{t.title}</span><span className="text-xs text-muted">{t.assigneeName ?? "Commune"} · terminée {t.completedAt ? timeAgo(t.completedAt) : ""}</span></span>
              <Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority]}</Badge>
            </button>
          ))}</Card2>)}

      <Modal open={Boolean(creating)} onClose={() => setCreating(null)} title="Nouvelle tâche">
        {creating && <TaskForm value={creating} users={users} episodes={episodes} contacts={contacts} onDone={() => setCreating(null)} />}
      </Modal>

      <Modal side open={Boolean(current)} onClose={() => { setEditing(false); setParam("tache", null); }} title={current ? (editing ? "Modifier la tâche" : "Tâche") : ""}>
        {current && (editing
          ? <TaskForm value={{ id: current.id, title: current.title, description: current.description ?? "", assigneeId: current.assigneeId ?? "", priority: current.priority, status: current.status, dueDate: current.dueDate ?? "", contactId: current.contactId ?? "", episodeId: current.episodeId ?? "" }}
              users={users} episodes={episodes} contacts={contacts} onDone={() => setEditing(false)} />
          : <TaskDetail t={current} detail={detail} canEdit={canEdit} canDelete={canDeleteAll || current.createdById === me.id}
              onEdit={() => setEditing(true)} onDeleted={() => setParam("tache", null)} />)}
      </Modal>
    </div>
  );
}

function Card2({ children }: { children: React.ReactNode }) {
  return <div className="card overflow-hidden">{children}</div>;
}

function TaskDetail({ t, detail, canEdit, canDelete, onEdit, onDeleted }: { t: TaskView; detail: Detail; canEdit: boolean; canDelete: boolean; onEdit: () => void; onDeleted: () => void }) {
  const { pending, exec } = useAction();
  const [comment, setComment] = useState("");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={cx("text-xl font-semibold leading-snug", t.status === "termine" && "text-muted line-through")}>{t.title}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={t.status === "termine" ? "ok" : "olive"}>{TASK_STATUS[t.status]}</Badge>
          <Badge tone={priorityTone(t.priority)}>Priorité {PRIORITY[t.priority].toLowerCase()}</Badge>
          {t.dueDate && <Badge tone={t.dueDate < todayISO() && t.status !== "termine" ? "alert" : "neutral"}>Échéance {formatDate(t.dueDate)}</Badge>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="eyebrow mb-1">Responsable</dt><dd className="flex items-center gap-2"><Avatar name={t.assigneeName} size={22} />{t.assigneeName ?? "Tâche commune"}</dd></div>
        <div><dt className="eyebrow mb-1">Créée par</dt><dd>{t.createdByName ?? "Automatisation"} · {formatDate(t.createdAt)}</dd></div>
        {t.contactName && <div><dt className="eyebrow mb-1">Invité</dt><dd><a className="text-gold" href={`/crm/${t.contactId}`}>{t.contactName}</a></dd></div>}
        {t.episodeTitle && <div><dt className="eyebrow mb-1">Épisode</dt><dd><a className="text-gold" href={`/production/${t.episodeId}`}>{t.episodeTitle}</a></dd></div>}
      </dl>
      {t.description && <p className="whitespace-pre-wrap rounded-xl border border-line bg-night p-4 text-sm leading-relaxed text-soft">{t.description}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Select value={t.status} onChange={(e) => exec(() => setTaskStatus(t.id, e.target.value as TaskView["status"]))} className="h-10 w-auto" aria-label="Statut">
            {Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Button onClick={onEdit}>Modifier</Button>
          {canDelete && <ConfirmButton message={`Supprimer définitivement « ${t.title} » ? Cette action est journalisée et irréversible.`} onConfirm={() => exec(() => deleteTask(t.id), { onSuccess: onDeleted })}><Trash2 className="size-4" />Supprimer</ConfirmButton>}
        </div>
      )}
      <section>
        <div className="eyebrow mb-2">Documents associés</div>
        {detail ? <Attachments entityType="task" entityId={t.id} items={detail.files} canEdit={canEdit} /> : <p className="text-sm text-muted">Chargement…</p>}
      </section>
      <section>
        <div className="eyebrow mb-2">Commentaires</div>
        <div className="flex flex-col gap-3">
          {detail?.comments.length === 0 && <p className="text-sm text-muted">Aucun commentaire pour l&apos;instant.</p>}
          {detail?.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar name={c.userName} size={26} />
              <div className="min-w-0 flex-1 rounded-xl border border-line bg-night px-3 py-2">
                <div className="text-xs text-muted">{c.userName} · {formatDateTime(c.createdAt)}</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
        <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); exec(() => addTaskComment(t.id, comment), { onSuccess: () => setComment("") }); }}>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Écrire un commentaire…" />
          <Button type="submit" variant="gold" loading={pending} disabled={!comment.trim()} aria-label="Envoyer"><Send className="size-4" /></Button>
        </form>
      </section>
    </div>
  );
}
