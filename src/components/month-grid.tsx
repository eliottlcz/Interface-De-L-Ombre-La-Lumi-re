"use client";
import { useId, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDroppable, useDraggable, DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { IconButton } from "@/components/ui";
import { addDaysISO, todayISO } from "@/lib/dates";

export type GridItem = { id: string; date: string; label: string; color?: string; muted?: boolean; time?: string };
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
}
export function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export function monthCells(ym: string): string[] {
  const first = `${ym}-01`;
  const dow = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  const start = addDaysISO(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}

/**
 * Calendrier mensuel réutilisable.
 *  - md+ : grille complète, éléments déplaçables par glisser-déposer (si onMove).
 *  - smartphone : mini-grille à points + liste du jour sélectionné (vue agenda).
 */
export function MonthGrid({ month, onMonth, items, onItem, onDay, onMove, header }: {
  month: string; onMonth: (m: string) => void; items: GridItem[]; onItem: (id: string) => void;
  onDay?: (date: string) => void; onMove?: (id: string, date: string) => void; header?: React.ReactNode;
}) {
  const cells = useMemo(() => monthCells(month), [month]);
  const dndId = useId();
  const today = todayISO();
  const [selected, setSelected] = useState<string>(today.startsWith(month) ? today : `${month}-01`);
  const byDay = useMemo(() => {
    const m = new Map<string, GridItem[]>();
    for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    for (const l of m.values()) l.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return m;
  }, [items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));
  const onEnd = (e: DragEndEvent) => { if (e.over && onMove) { const it = items.find((i) => i.id === e.active.id); if (it && it.date !== e.over.id) onMove(it.id, String(e.over.id)); } };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton label="Mois précédent" onClick={() => onMonth(shiftMonth(month, -1))}><ChevronLeft className="size-5" /></IconButton>
        <div className="display min-w-44 text-center text-sm">{monthLabel(month)}</div>
        <IconButton label="Mois suivant" onClick={() => onMonth(shiftMonth(month, 1))}><ChevronRight className="size-5" /></IconButton>
        <button onClick={() => { onMonth(today.slice(0, 7)); setSelected(today); }} className="ml-1 rounded-full border border-line px-3 py-1 text-xs text-soft hover:border-gold">Aujourd&apos;hui</button>
        <div className="ml-auto">{header}</div>
      </div>

      {/* Grille complète (tablette / ordinateur) */}
      <DndContext id={dndId} sensors={sensors} onDragEnd={onEnd}>
        <div className="hidden overflow-hidden rounded-[14px] border border-line md:block">
          <div className="grid grid-cols-7 border-b border-line bg-panel">
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d) => (
              <DayCell key={d} date={d} inMonth={d.startsWith(month)} isToday={d === today} onDay={onDay}>
                {(byDay.get(d) ?? []).slice(0, 4).map((it) => <GridChip key={it.id} it={it} onItem={onItem} draggable={Boolean(onMove)} />)}
                {(byDay.get(d)?.length ?? 0) > 4 && <button onClick={() => onDay?.(d)} className="px-1 text-left text-[11px] text-muted">+{byDay.get(d)!.length - 4} autres</button>}
              </DayCell>
            ))}
          </div>
        </div>
      </DndContext>

      {/* Agenda (smartphone) */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-y-1 rounded-[14px] border border-line bg-panel p-2">
          {WEEKDAYS.map((d) => <div key={d} className="text-center text-[10px] font-semibold uppercase text-muted">{d[0]}</div>)}
          {cells.map((d) => {
            const n = byDay.get(d)?.length ?? 0;
            return (
              <button key={d} onClick={() => setSelected(d)} className={clsx("mx-auto flex size-10 flex-col items-center justify-center rounded-full text-sm",
                d === selected ? "bg-gold text-black" : d === today ? "border border-gold text-gold" : d.startsWith(month) ? "text-cream" : "text-muted/50")}>
                {Number(d.slice(8))}
                <span className={clsx("mt-0.5 h-1 w-1 rounded-full", n ? (d === selected ? "bg-black" : "bg-gold") : "bg-transparent")} />
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="eyebrow">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(selected + "T12:00:00Z"))}</div>
            {onDay && <button onClick={() => onDay(selected)} className="text-sm font-semibold text-gold">+ Ajouter</button>}
          </div>
          <div className="flex flex-col gap-2">
            {(byDay.get(selected) ?? []).length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Rien de prévu.</p>}
            {(byDay.get(selected) ?? []).map((it) => (
              <button key={it.id} onClick={() => onItem(it.id)} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-left">
                <span className="h-8 w-1 -skew-x-12" style={{ background: it.color ?? "#DFC662" }} />
                <span className="min-w-0 flex-1"><span className={clsx("block truncate text-[15px]", it.muted && "text-muted line-through")}>{it.label}</span>{it.time && <span className="text-xs text-muted">{it.time}</span>}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayCell({ date, inMonth, isToday, onDay, children }: { date: string; inMonth: boolean; isToday: boolean; onDay?: (d: string) => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <div ref={setNodeRef} onDoubleClick={() => onDay?.(date)}
      className={clsx("min-h-[112px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-night/60", isOver && "bg-gold/10")}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className={clsx("text-xs", isToday ? "flex size-6 items-center justify-center rounded-full bg-gold font-bold text-black" : inMonth ? "text-soft" : "text-muted/50")}>{Number(date.slice(8))}</span>
        {onDay && <button onClick={() => onDay(date)} className="text-xs text-muted opacity-0 hover:text-gold focus:opacity-100 [div:hover>&]:opacity-100" aria-label="Ajouter">+</button>}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
function GridChip({ it, onItem, draggable }: { it: GridItem; onItem: (id: string) => void; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: it.id, disabled: !draggable });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onItem(it.id)}
      className={clsx("flex w-full items-center gap-1.5 truncate rounded-md bg-panel-2 px-1.5 py-1 text-left text-[11px] hover:bg-line", isDragging && "opacity-40", it.muted && "text-muted line-through")}>
      <span className="h-3 w-[3px] shrink-0 -skew-x-12" style={{ background: it.color ?? "#DFC662" }} />
      {it.time && <span className="text-muted">{it.time}</span>}
      <span className="truncate">{it.label}</span>
    </button>
  );
}
