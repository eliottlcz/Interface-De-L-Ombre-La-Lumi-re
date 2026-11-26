"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2, MapPin } from "lucide-react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useId } from "react";
import { Avatar, Badge, Button, Checkbox, ConfirmButton, Field, IconButton, Input, Modal, PageHeader, Segmented, Select, Textarea, useAction, cx } from "@/components/ui";
import { MonthGrid } from "@/components/month-grid";
import { deleteEvent, moveEvent, saveEvent, type EventInputT } from "@/actions/calendar";
import { moveContentDate } from "@/actions/production";
import { EVENT_COLOR, EVENT_TYPE } from "@/lib/labels";
import { addDaysISO, todayISO } from "@/lib/dates";

type Opt = { id: string; label: string };
export type CalItem = {
  id: string; source: "event" | "content"; title: string; type: keyof typeof EVENT_TYPE; date: string; time: string | null; endTime: string | null; allDay: boolean;
  assigneeId: string | null; assigneeName: string | null; contactId: string | null; contactName: string | null; episodeId: string | null; episodeTitle: string | null;
  taskId: string | null; location: string | null; notes: string | null; done: boolean;
};
type Mode = "mois" | "semaine" | "jour";
const weekStart = (d: string) => addDaysISO(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));
const dayLabel = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...o }).format(new Date(d + "T12:00:00Z"));

export function CalendarView({ items, anchor, users, contacts, episodes, tasks, canEdit, canEditContent, openId, createType }: {
  items: CalItem[]; anchor: string; users: Opt[]; contacts: Opt[]; episodes: Opt[]; tasks: Opt[]; canEdit: boolean; canEditContent: boolean; openId: string | null; createType: string | null;
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const mode = (sp.get("vue") ?? "mois") as Mode;
  const [day, setDay] = useState(anchor);
  const [types, setTypes] = useState<string[]>([]);
  const [who, setWho] = useState("");
  const [editing, setEditing] = useState<CalItem | { new: true; date: string; type?: string } | null>(createType && canEdit ? { new: true, date: todayISO(), type: createType === "1" ? "autre" : createType } : null);
  const [viewing, setViewing] = useState<CalItem | null>(openId ? items.find((i) => i.id === openId) ?? null : null);
  const { exec } = useAction();
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); p.set(k, v); p.delete("nouveau"); p.delete("evenement"); router.replace(`${pathname}?${p}`, { scroll: false }); };
  const goto = (d: string) => { setDay(d); if (Math.abs(new Date(d).getTime() - new Date(anchor).getTime()) > 80 * 864e5) setParam("jour", d); };

  const visible = useMemo(() => items.filter((i) => (!types.length || types.includes(i.type)) && (!who || i.assigneeId === who)), [items, types, who]);
  const open = (id: string) => setViewing(items.find((i) => i.id === id) ?? null);
  const move = (id: string, d: string) => {
    const it = items.find((i) => i.id === id); if (!it) return;
    if (it.source === "content") { if (canEditContent) exec(() => moveContentDate(id, d)); } else if (canEdit) exec(() => moveEvent(id, d));
  };
  const color = (i: CalItem) => EVENT_COLOR[i.type];

  return (
    <div>
      <PageHeader eyebrow="Calendrier éditorial" title="Ce qui se prépare dans l'ombre"
        description="Contacts, relances, interviews, tournages, montages, validations et publications sur toutes les plateformes."
        actions={canEdit && <Button variant="gold" onClick={() => setEditing({ new: true, date: day })}><Plus className="size-4" />Planifier</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={mode} onChange={(v) => setParam("vue", v)} items={[{ value: "mois", label: "Mois" }, { value: "semaine", label: "Semaine" }, { value: "jour", label: "Jour" }]} />
        <Select value={who} onChange={(e) => setWho(e.target.value)} className="h-9 w-auto text-sm" aria-label="Responsable"><option value="">Toute l&apos;équipe</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select>
      </div>
      <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {(Object.keys(EVENT_TYPE) as (keyof typeof EVENT_TYPE)[]).map((t) => {
          const on = types.includes(t);
          return <button key={t} onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])}
            className={cx("touch-lg inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition", on ? "border-gold text-cream" : "border-line text-muted hover:text-cream")}>
            <span className="h-2.5 w-[3px] -skew-x-12" style={{ background: EVENT_COLOR[t] }} />{EVENT_TYPE[t]}</button>;
        })}
        {types.length > 0 && <button onClick={() => setTypes([])} className="px-2 text-[11px] text-gold">Tout afficher</button>}
      </div>

      {mode === "mois" && (
        <MonthGrid month={day.slice(0, 7)} onMonth={(m) => goto(`${m}-01`)}
          items={visible.map((i) => ({ id: i.id, date: i.date, label: i.title, color: color(i), time: i.time ?? undefined, muted: i.done }))}
          onItem={open} onDay={canEdit ? (d) => setEditing({ new: true, date: d }) : undefined} onMove={canEdit || canEditContent ? move : undefined} />
      )}
      {mode !== "mois" && (
        <TimeColumns days={mode === "semaine" ? Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart(day), i)) : [day]}
          items={visible} onItem={open} onMove={move} onAdd={canEdit ? (d) => setEditing({ new: true, date: d }) : undefined}
          onPrev={() => goto(addDaysISO(day, mode === "semaine" ? -7 : -1))} onNext={() => goto(addDaysISO(day, mode === "semaine" ? 7 : 1))} onToday={() => goto(todayISO())} />
      )}

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? EVENT_TYPE[viewing.type] : ""}>
        {viewing && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold">{viewing.title}</h2>
              <p className="mt-1 text-sm text-soft">{dayLabel(viewing.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{viewing.time && ` · ${viewing.time}${viewing.endTime ? `–${viewing.endTime}` : ""}`}</p>
              {viewing.source === "content" && <Badge tone="gold" className="mt-2">Publication prévue (déclinaison de contenu)</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Responsable</dt><dd className="mt-1 flex items-center gap-2"><Avatar name={viewing.assigneeName} size={20} />{viewing.assigneeName ?? "—"}</dd></div>
              {viewing.location && <div><dt className="text-xs text-muted">Lieu</dt><dd className="mt-1 flex items-center gap-1"><MapPin className="size-3.5" />{viewing.location}</dd></div>}
              {viewing.contactName && <div><dt className="text-xs text-muted">Invité</dt><dd className="mt-1"><Link className="text-gold" href={`/crm/${viewing.contactId}`}>{viewing.contactName}</Link></dd></div>}
              {viewing.episodeTitle && <div><dt className="text-xs text-muted">Épisode</dt><dd className="mt-1"><Link className="text-gold" href={`/production/${viewing.episodeId}`}>{viewing.episodeTitle}</Link></dd></div>}
              {viewing.taskId && <div><dt className="text-xs text-muted">Tâche</dt><dd className="mt-1"><Link className="text-gold" href={`/missions?espace=tout&tache=${viewing.taskId}`}>Ouvrir la tâche</Link></dd></div>}
            </dl>
            {viewing.notes && <p className="whitespace-pre-wrap rounded-xl border border-line bg-night p-3 text-sm text-soft">{viewing.notes}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {viewing.source === "event" && canEdit && <ConfirmButton variant="ghost" message="Supprimer cet événement ?" onConfirm={() => exec(() => deleteEvent(viewing.id), { onSuccess: () => setViewing(null) })}><Trash2 className="size-4" /></ConfirmButton>}
              {viewing.source === "content" ? <Link className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-sm" href={viewing.episodeId ? `/production/${viewing.episodeId}#contenus` : "/contenus"}>Ouvrir le contenu</Link>
                : canEdit && <Button variant="gold" onClick={() => { setEditing(viewing); setViewing(null); }}>Modifier</Button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && "new" in editing ? "Planifier" : "Modifier l'événement"}>
        {editing && <EventForm init={editing} users={users} contacts={contacts} episodes={episodes} tasks={tasks} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function TimeColumns({ days, items, onItem, onMove, onAdd, onPrev, onNext, onToday }: { days: string[]; items: CalItem[]; onItem: (id: string) => void; onMove: (id: string, d: string) => void; onAdd?: (d: string) => void; onPrev: () => void; onNext: () => void; onToday: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));
  const id = useId();
  const today = todayISO();
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Précédent" onClick={onPrev}><ChevronLeft className="size-5" /></IconButton>
        <div className="display min-w-0 text-center text-sm">{days.length === 1 ? dayLabel(days[0], { weekday: "long", day: "numeric", month: "long" }) : `${dayLabel(days[0], { day: "numeric", month: "short" })} – ${dayLabel(days[6], { day: "numeric", month: "short", year: "numeric" })}`}</div>
        <IconButton label="Suivant" onClick={onNext}><ChevronRight className="size-5" /></IconButton>
        <button onClick={onToday} className="rounded-full border border-line px-3 py-1 text-xs text-soft hover:border-gold">Aujourd&apos;hui</button>
      </div>
      <DndContext id={id} sensors={sensors} onDragEnd={(e) => { if (e.over) onMove(String(e.active.id), String(e.over.id)); }}>
        <div className={cx("grid gap-2", days.length === 7 ? "grid-cols-1 md:grid-cols-7" : "grid-cols-1")}>
          {days.map((d) => {
            const list = items.filter((i) => i.date === d).sort((a, b) => (a.allDay ? "" : a.time ?? "").localeCompare(b.allDay ? "" : b.time ?? ""));
            return (
              <DayColumn key={d} date={d}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={cx("text-xs font-semibold uppercase tracking-wider", d === today ? "text-gold" : "text-muted")}>{dayLabel(d, { weekday: "short", day: "numeric" })}</span>
                  {onAdd && <button onClick={() => onAdd(d)} className="text-sm text-muted hover:text-gold" aria-label="Ajouter">+</button>}
                </div>
                <div className="flex flex-col gap-1.5">
                  {list.length === 0 && <span className="text-[11px] text-muted/60">—</span>}
                  {list.map((i) => <Chip key={i.id} i={i} onItem={onItem} />)}
                </div>
              </DayColumn>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}
function DayColumn({ date, children }: { date: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return <div ref={setNodeRef} className={cx("min-h-28 rounded-xl border bg-panel p-2 md:min-h-[420px]", isOver ? "border-gold" : "border-line")}>{children}</div>;
}
function Chip({ i, onItem }: { i: CalItem; onItem: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: i.id });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onItem(i.id)}
      className={cx("flex w-full gap-2 rounded-lg bg-panel-2 p-2 text-left hover:bg-line", isDragging && "opacity-40")}>
      <span className="w-1 shrink-0 -skew-x-12 rounded-sm" style={{ background: EVENT_COLOR[i.type] }} />
      <span className="min-w-0">
        <span className="block text-[11px] text-muted">{i.allDay ? "Journée" : `${i.time}${i.endTime ? `–${i.endTime}` : ""}`}</span>
        <span className={cx("block text-[13px] leading-snug", i.done && "text-muted line-through")}>{i.title}</span>
        {i.assigneeName && <span className="block truncate text-[11px] text-muted">{i.assigneeName}</span>}
      </span>
    </button>
  );
}

function EventForm({ init, users, contacts, episodes, tasks, onDone }: { init: CalItem | { new: true; date: string; type?: string }; users: Opt[]; contacts: Opt[]; episodes: Opt[]; tasks: Opt[]; onDone: () => void }) {
  const isNew = "new" in init;
  const { pending, exec } = useAction();
  const [v, setV] = useState({
    title: isNew ? (init.type === "tournage" ? "Tournage — " : "") : init.title,
    type: (isNew ? init.type ?? "autre" : init.type) as string,
    day: isNew ? init.date : init.date, allDay: isNew ? false : init.allDay,
    start: isNew ? "10:00" : init.time ?? "10:00", end: isNew ? "" : init.endTime ?? "",
    assigneeId: isNew ? "" : init.assigneeId ?? "", contactId: isNew ? "" : init.contactId ?? "", episodeId: isNew ? "" : init.episodeId ?? "",
    taskId: isNew ? "" : init.taskId ?? "", location: isNew ? "" : init.location ?? "", notes: isNew ? "" : init.notes ?? "",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); exec(() => saveEvent(isNew ? null : init.id, v as EventInputT), { onSuccess: onDone }); }}>
      <Field label="Titre" required className="sm:col-span-2"><Input value={v.title} onChange={set("title")} required /></Field>
      <Field label="Type"><Select value={v.type} onChange={set("type")}>{Object.entries(EVENT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Date"><Input type="date" value={v.day} onChange={set("day")} required /></Field>
      <div className="sm:col-span-2"><Checkbox checked={v.allDay} onChange={(x) => setV({ ...v, allDay: x })} label="Toute la journée" /></div>
      {!v.allDay && <><Field label="Début"><Input type="time" value={v.start} onChange={set("start")} /></Field><Field label="Fin"><Input type="time" value={v.end} onChange={set("end")} /></Field></>}
      <Field label="Attribué à"><Select value={v.assigneeId} onChange={set("assigneeId")}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
      <Field label="Lieu"><Input value={v.location} onChange={set("location")} /></Field>
      <Field label="Invité"><Select value={v.contactId} onChange={set("contactId")}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Field label="Épisode"><Select value={v.episodeId} onChange={set("episodeId")}><option value="">—</option>{episodes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Field label="Tâche associée" className="sm:col-span-2"><Select value={v.taskId} onChange={set("taskId")}><option value="">—</option>{tasks.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={v.notes} onChange={set("notes")} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Enregistrer</Button></div>
    </form>
  );
}
