import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { listContactOptions, listEpisodeOptions, listUsers, episodeLabel } from "@/lib/queries";
import { addDaysISO, parisToUtc, todayISO, utcToParis } from "@/lib/dates";
import { CalendarView, type CalItem } from "./calendar-view";

export const metadata = { title: "Calendrier éditorial" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("calendrier.voir");
  const sp = await searchParams;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.jour ?? "") ? sp.jour! : todayISO();
  const from = addDaysISO(anchor, -100), to = addDaysISO(anchor, 100);
  const [events, contents, users, contacts, episodes, tasks] = await Promise.all([
    db.select({ e: s.events, assigneeName: s.users.name, episodeTitle: s.episodes.title, contactName: sql<string | null>`nullif(trim(${s.contacts.firstName} || ' ' || ${s.contacts.lastName}), '')` })
      .from(s.events).leftJoin(s.users, eq(s.users.id, s.events.assigneeId)).leftJoin(s.episodes, eq(s.episodes.id, s.events.episodeId)).leftJoin(s.contacts, eq(s.contacts.id, s.events.contactId))
      .where(and(gte(s.events.startsAt, parisToUtc(from)), lte(s.events.startsAt, parisToUtc(to)))),
    can(user, "production.voir") ? db.select({ c: s.contents, ownerName: s.users.name, episodeTitle: s.episodes.title }).from(s.contents).leftJoin(s.users, eq(s.users.id, s.contents.ownerId)).leftJoin(s.episodes, eq(s.episodes.id, s.contents.episodeId))
      .where(and(gte(s.contents.plannedDate, from), lte(s.contents.plannedDate, to))) : Promise.resolve([]),
    listUsers(), listContactOptions(), listEpisodeOptions(),
    db.select({ id: s.tasks.id, title: s.tasks.title }).from(s.tasks).where(sql`${s.tasks.status} <> 'termine'`).limit(300),
  ]);
  const KIND_TO_TYPE: Record<string, CalItem["type"]> = { youtube_complet: "pub_youtube", short: "pub_youtube", audio: "pub_podcast", reel: "pub_instagram", citation: "pub_instagram", tiktok: "pub_tiktok", teaser: "autre", promo: "autre" };
  const items: CalItem[] = [
    ...events.map(({ e, assigneeName, episodeTitle, contactName }) => {
      const p = utcToParis(e.startsAt);
      return { id: e.id, source: "event" as const, title: e.title, type: e.type, date: p.date, time: e.allDay ? null : p.time, endTime: e.endsAt && !e.allDay ? utcToParis(e.endsAt).time : null, allDay: e.allDay,
        assigneeId: e.assigneeId, assigneeName, contactId: e.contactId, contactName, episodeId: e.episodeId, episodeTitle, taskId: e.taskId, location: e.location, notes: e.notes, done: false };
    }),
    ...contents.map(({ c, ownerName, episodeTitle }) => ({ id: c.id, source: "content" as const, title: c.title, type: KIND_TO_TYPE[c.kind], date: c.plannedDate!, time: null, endTime: null, allDay: true,
      assigneeId: c.ownerId, assigneeName: ownerName, contactId: null, contactName: null, episodeId: c.episodeId, episodeTitle, taskId: null, location: null, notes: null, done: c.status === "publie" })),
  ];
  return <CalendarView items={items} anchor={anchor} users={users.map((u) => ({ id: u.id, label: u.name }))}
    contacts={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))}
    episodes={episodes.map((e) => ({ id: e.id, label: episodeLabel(e) }))} tasks={tasks.map((t) => ({ id: t.id, label: t.title }))}
    canEdit={can(user, "calendrier.modifier")} canEditContent={can(user, "production.modifier")}
    openId={sp.evenement ?? null} createType={sp.nouveau ?? null} />;
}
