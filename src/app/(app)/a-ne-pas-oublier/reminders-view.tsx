"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Card, EmptyState, PageHeader, Segmented, Select } from "@/components/ui";
import { REMINDER_LABEL, type Reminder, type ReminderKind } from "@/lib/reminder-labels";
import { addDaysISO, relativeDay, todayISO, formatDate } from "@/lib/dates";
import { ChevronRight } from "lucide-react";

const ORDER: ReminderKind[] = ["tache_retard", "relance", "a_contacter", "reponse_attente", "tournage", "preparation", "montage", "validation", "publication", "autorisation", "tache_echeance", "finance"];
const URG_LABEL = { retard: "En retard", aujourdhui: "Aujourd'hui", semaine: "Dans les 7 jours", plus_tard: "Plus tard", sans_date: "Sans date" } as const;

export function RemindersView({ reminders, users, meId }: { reminders: Reminder[]; users: { id: string; label: string }[]; meId: string }) {
  const [who, setWho] = useState("");
  const [by, setBy] = useState<"urgence" | "type" | "responsable">("urgence");
  const list = useMemo(() => reminders.filter((r) => !who || (who === "moi" ? r.ownerId === meId : who === "aucun" ? !r.ownerId : r.ownerId === who)), [reminders, who, meId]);
  const today = todayISO();
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i));
  const uname = (id: string | null) => users.find((u) => u.id === id)?.label ?? "Non attribué";
  const groups: [string, Reminder[]][] = by === "urgence"
    ? (Object.keys(URG_LABEL) as (keyof typeof URG_LABEL)[]).map((u) => [URG_LABEL[u], list.filter((r) => r.urgency === u)])
    : by === "type" ? ORDER.map((k) => [REMINDER_LABEL[k], list.filter((r) => r.kind === k)])
    : [...users.map((u) => [u.label, list.filter((r) => r.ownerId === u.id)] as [string, Reminder[]]), ["Non attribué", list.filter((r) => !r.ownerId)]];
  const late = list.filter((r) => r.urgency === "retard").length;

  return (
    <div>
      <PageHeader eyebrow="À ne pas oublier" title="Rien ne reste dans l'ombre"
        description="Toutes les échéances du média, rassemblées automatiquement : contacts, relances, tournages, montages, validations, publications, autorisations, tâches et finances." />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["En retard", late, "text-alert"], ["Aujourd'hui", list.filter((r) => r.urgency === "aujourdhui").length, "text-gold"], ["7 prochains jours", list.filter((r) => r.urgency === "semaine").length, ""], ["Au total", list.length, ""]].map(([l, n, c]) => (
          <Card key={l as string} className="p-4"><div className="eyebrow">{l}</div><div className={clsx("display mt-2 text-3xl", c as string)}>{n as number}</div></Card>
        ))}
      </div>

      <section className="mb-8">
        <div className="eyebrow mb-3">Cette semaine</div>
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0">
          {week.map((d) => {
            const items = list.filter((r) => r.date === d);
            return (
              <div key={d} className={clsx("min-h-32 w-[70vw] shrink-0 snap-start rounded-xl border bg-panel p-3 sm:w-[40vw] md:w-auto", d === today ? "border-gold/60" : "border-line")}>
                <div className={clsx("mb-2 text-xs font-semibold uppercase tracking-wider", d === today ? "text-gold" : "text-muted")}>{d === today ? "Aujourd'hui" : new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"))}</div>
                <div className="flex flex-col gap-1.5">
                  {items.length === 0 && <span className="text-[11px] text-muted/60">—</span>}
                  {items.map((r) => <Link key={r.key} href={r.href} className="rounded-lg bg-panel-2 px-2 py-1.5 text-[12px] leading-snug hover:bg-line"><span className="block text-[10px] text-muted">{REMINDER_LABEL[r.kind]}</span>{r.title}</Link>)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={by} onChange={setBy} items={[{ value: "urgence", label: "Par urgence" }, { value: "type", label: "Par type" }, { value: "responsable", label: "Par responsable" }]} />
        <Select value={who} onChange={(e) => setWho(e.target.value)} className="h-9 w-auto text-sm" aria-label="Responsable">
          <option value="">Toute l&apos;équipe</option><option value="moi">Moi</option>{users.filter((u) => u.id !== meId).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}<option value="aucun">Non attribué</option>
        </Select>
      </div>

      {list.length === 0 ? <EmptyState title="Tout est dans la lumière">Aucune échéance en attente. Le QG veille et vous préviendra.</EmptyState> : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {groups.filter(([, l]) => l.length).map(([label, items]) => (
            <Card key={label} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="display text-xs">{label}</span><span className="text-xs text-muted">{items.length}</span></div>
              {items.map((r) => (
                <Link key={r.key} href={r.href} className="group flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-panel-2">
                  <span className={clsx("h-8 w-1 shrink-0 -skew-x-12 rounded-sm", r.urgency === "retard" ? "bg-alert" : r.urgency === "aujourdhui" ? "bg-gold" : "bg-line-strong")} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm">{r.title}</span><span className="block truncate text-xs text-muted">{by !== "type" ? REMINDER_LABEL[r.kind] + " · " : ""}{r.detail ? r.detail + " · " : ""}{by !== "responsable" ? uname(r.ownerId) : ""}</span></span>
                  {r.date && <span className={clsx("shrink-0 text-right text-xs", r.urgency === "retard" ? "text-alert" : r.urgency === "aujourdhui" ? "text-gold" : "text-muted")}>{relativeDay(r.date)}<span className="hidden text-muted sm:block">{formatDate(r.date, { day: "numeric", month: "short" })}</span></span>}
                  <ChevronRight className="size-4 shrink-0 text-muted group-hover:text-gold" />
                </Link>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
