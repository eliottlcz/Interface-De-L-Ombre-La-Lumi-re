"use client";
import clsx from "clsx";
import { CalendarDays, MessageSquare, Paperclip } from "lucide-react";
import { Avatar, Badge, Checkbox, useAction } from "@/components/ui";
import { setTaskStatus } from "@/actions/tasks";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { formatDate, relativeDay, todayISO } from "@/lib/dates";

export type TaskView = {
  id: string; title: string; description: string | null; status: "a_faire" | "en_cours" | "en_attente" | "termine";
  priority: "basse" | "normale" | "haute" | "urgente"; dueDate: string | null; completedAt: string | null; createdAt: string;
  assigneeId: string | null; assigneeName: string | null; createdById: string | null; createdByName: string | null;
  contactId: string | null; contactName: string | null; episodeId: string | null; episodeTitle: string | null;
  comments: number; files: number;
};

export function priorityTone(p: TaskView["priority"]) {
  return p === "urgente" ? "alert" : p === "haute" ? "gold" : p === "basse" ? "muted" : "neutral";
}

export function TaskCard({ t, onOpen, canEdit, compact }: { t: TaskView; onOpen: () => void; canEdit: boolean; compact?: boolean }) {
  const { exec } = useAction();
  const late = t.dueDate && t.status !== "termine" && t.dueDate < todayISO();
  return (
    <div className={clsx("group rounded-xl border bg-night p-3 transition hover:border-line-strong", late ? "border-alert/40" : "border-line")}>
      <div className="flex items-start gap-3">
        <span onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox checked={t.status === "termine"} disabled={!canEdit} onChange={(v) => exec(() => setTaskStatus(t.id, v ? "termine" : "a_faire"), { success: v ? "Une de plus dans la lumière ✓" : "Tâche rouverte" })} />
        </span>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className={clsx("text-[14px] font-medium leading-snug", t.status === "termine" && "text-muted line-through")}>{t.title}</div>
          {!compact && (t.episodeTitle || t.contactName) && <div className="mt-0.5 truncate text-xs text-muted">{[t.episodeTitle, t.contactName].filter(Boolean).join(" · ")}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority]}</Badge>
            {t.status !== "a_faire" && t.status !== "termine" && <Badge tone="olive">{TASK_STATUS[t.status]}</Badge>}
            {t.dueDate && <span className={clsx("inline-flex items-center gap-1 text-[11px]", late ? "text-alert" : "text-muted")}><CalendarDays className="size-3" />{late ? `en retard · ${formatDate(t.dueDate, { day: "numeric", month: "short" })}` : relativeDay(t.dueDate)}</span>}
            {t.comments > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-muted"><MessageSquare className="size-3" />{t.comments}</span>}
            {t.files > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-muted"><Paperclip className="size-3" />{t.files}</span>}
          </div>
        </button>
        <Avatar name={t.assigneeName} size={26} />
      </div>
    </div>
  );
}
