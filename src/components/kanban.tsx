"use client";
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { useState } from "react";
import clsx from "clsx";

export type KanbanColumn = { id: string; label: string; accent?: boolean };
export type KanbanItem = { id: string; column: string };

/**
 * Kanban générique.
 *  - Ordinateur / iPad : glisser-déposer (souris, tactile avec appui long, clavier).
 *  - Smartphone : colonnes défilables horizontalement, et chaque carte reçoit un sélecteur
 *    de colonne (via `renderCard(item, { moveTo })`), donc aucune fonctionnalité perdue.
 */
export function Kanban<T extends KanbanItem>({ columns, items, renderCard, onMove, disabled }: {
  columns: KanbanColumn[]; items: T[]; onMove: (id: string, column: string) => void; disabled?: boolean;
  renderCard: (item: T) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [active, setActive] = useState<string | null>(null);
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const to = e.over?.id as string | undefined;
    const item = items.find((i) => i.id === e.active.id);
    if (to && item && item.column !== to) onMove(item.id, to);
  };
  const activeItem = items.find((i) => i.id === active);
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {columns.map((c) => {
          const list = items.filter((i) => i.column === c.id);
          return <Column key={c.id} col={c} count={list.length}>{list.map((it) => <Card key={it.id} id={it.id} disabled={disabled}>{renderCard(it)}</Card>)}</Column>;
        })}
      </div>
      <DragOverlay>{activeItem ? <div className="rotate-1 opacity-95">{renderCard(activeItem)}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ col, count, children }: { col: KanbanColumn; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section ref={setNodeRef} className={clsx("flex w-[85vw] shrink-0 snap-start flex-col rounded-[14px] border bg-panel/60 sm:w-[300px] lg:w-[290px]", isOver ? "border-gold" : "border-line")}>
      <header className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={clsx("h-3.5 w-1 -skew-x-12", col.accent ? "bg-gold" : "bg-line-strong")} />{col.label}
        </span>
        <span className="text-xs text-muted">{count}</span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">{children}</div>
    </section>
  );
}
function Card({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return <div ref={setNodeRef} {...attributes} {...listeners} className={clsx("touch-manipulation", isDragging && "opacity-30")}>{children}</div>;
}
