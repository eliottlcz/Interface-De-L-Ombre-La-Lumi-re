import Link from "next/link";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { Reminder } from "@/lib/reminder-labels";
import { REMINDER_LABEL } from "@/lib/reminder-labels";
import { formatDate, relativeDay } from "@/lib/dates";

const URG: Record<Reminder["urgency"], { label: string; cls: string }> = {
  retard: { label: "En retard", cls: "text-alert" }, aujourdhui: { label: "Aujourd'hui", cls: "text-gold" },
  semaine: { label: "Cette semaine", cls: "text-soft" }, plus_tard: { label: "Plus tard", cls: "text-muted" }, sans_date: { label: "Sans date", cls: "text-muted" },
};

export function ReminderRow({ r, owner }: { r: Reminder; owner?: string | null }) {
  return (
    <Link href={r.href} className="group flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-panel-2">
      <span className={clsx("h-8 w-1 shrink-0 -skew-x-12 rounded-sm", r.urgency === "retard" ? "bg-alert" : r.urgency === "aujourdhui" ? "bg-gold" : "bg-line-strong")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{r.title}</span>
        <span className="block truncate text-xs text-muted">{REMINDER_LABEL[r.kind]}{r.detail ? ` · ${r.detail}` : ""}{owner ? ` · ${owner}` : ""}</span>
      </span>
      {r.date && <span className={clsx("shrink-0 text-right text-xs", URG[r.urgency].cls)}><span className="block">{relativeDay(r.date)}</span><span className="hidden text-muted sm:block">{formatDate(r.date, { day: "numeric", month: "short" })}</span></span>}
      <ChevronRight className="size-4 shrink-0 text-muted group-hover:text-gold" />
    </Link>
  );
}
export { URG as URGENCY_STYLE };
