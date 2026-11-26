"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { parisToUtc, utcToParis } from "@/lib/dates";
import { EVENT_TYPE } from "@/lib/labels";

const blank = (v: unknown) => (v === "" ? null : v);
const EventInput = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(300),
  type: z.enum(["prise_contact", "relance", "interview", "tournage", "montage", "validation", "pub_youtube", "pub_instagram", "pub_tiktok", "pub_podcast", "autre"]),
  day: z.iso.date({ message: "Date invalide" }),
  allDay: z.boolean().default(false),
  start: z.preprocess(blank, z.string().regex(/^\d{2}:\d{2}$/).nullable().optional()),
  end: z.preprocess(blank, z.string().regex(/^\d{2}:\d{2}$/).nullable().optional()),
  assigneeId: z.preprocess(blank, z.uuid().nullable().optional()),
  contactId: z.preprocess(blank, z.uuid().nullable().optional()),
  episodeId: z.preprocess(blank, z.uuid().nullable().optional()),
  taskId: z.preprocess(blank, z.uuid().nullable().optional()),
  location: z.preprocess(blank, z.string().max(300).nullable().optional()),
  notes: z.preprocess(blank, z.string().max(10000).nullable().optional()),
});
export type EventInputT = z.input<typeof EventInput>;

function times(v: z.output<typeof EventInput>) {
  const startsAt = parisToUtc(v.day, v.allDay ? "09:00" : v.start ?? "09:00");
  const endsAt = !v.allDay && v.end ? parisToUtc(v.day, v.end) : null;
  if (endsAt && endsAt <= startsAt) userError("L'heure de fin doit être après l'heure de début.");
  return { startsAt, endsAt };
}

export async function saveEvent(id: string | null, input: EventInputT) {
  return run(async () => {
    const u = await assertPermission("calendrier.modifier");
    const v = EventInput.parse(input);
    const { day, start, end, ...rest } = v; void day; void start; void end;
    const t = times(v);
    let evId = id;
    if (id) {
      const [before] = await db.select().from(s.events).where(eq(s.events.id, id));
      if (!before) userError("Événement introuvable");
      await db.update(s.events).set({ ...rest, ...t, updatedAt: new Date() }).where(eq(s.events.id, id));
      if (v.assigneeId && v.assigneeId !== before.assigneeId) await notify({ userIds: [v.assigneeId], type: "calendrier", title: `${u.name} vous a attribué : ${v.title}`, link: `/calendrier?evenement=${id}`, actorId: u.id });
      // Un tournage déplacé met à jour la fiche épisode
      if (before.automationKey?.endsWith(":tournage") && before.episodeId) await db.update(s.episodes).set({ shootDate: t.startsAt, shootLocation: v.location ?? null }).where(eq(s.episodes.id, before.episodeId));
    } else {
      const [ev] = await db.insert(s.events).values({ ...rest, ...t, createdBy: u.id }).returning();
      evId = ev.id;
      if (v.assigneeId) await notify({ userIds: [v.assigneeId], type: "calendrier", title: `${u.name} a planifié : ${v.title}`, body: EVENT_TYPE[v.type], link: `/calendrier?evenement=${ev.id}`, actorId: u.id });
      if (v.type === "tournage" && v.episodeId) {
        const [ep] = await db.select().from(s.episodes).where(eq(s.episodes.id, v.episodeId));
        if (ep && !ep.shootDate) await db.update(s.episodes).set({ shootDate: t.startsAt, shootLocation: v.location ?? ep.shootLocation }).where(eq(s.episodes.id, ep.id));
      }
    }
    await audit({ userId: u.id, action: id ? "evenement.modification" : "evenement.creation", entityType: "event", entityId: evId, summary: `${EVENT_TYPE[v.type]} — ${v.title}` });
    return { ok: true as const, message: id ? "Événement enregistré" : "Événement planifié" };
  });
}

/** Glisser-déposer : change le jour en conservant l'heure. */
export async function moveEvent(id: string, day: string) {
  return run(async () => {
    const u = await assertPermission("calendrier.modifier");
    const [ev] = await db.select().from(s.events).where(eq(s.events.id, id));
    if (!ev) userError("Événement introuvable");
    const d = z.iso.date().parse(day);
    const startsAt = parisToUtc(d, utcToParis(ev.startsAt).time);
    const endsAt = ev.endsAt ? new Date(startsAt.getTime() + (ev.endsAt.getTime() - ev.startsAt.getTime())) : null;
    await db.update(s.events).set({ startsAt, endsAt, updatedAt: new Date() }).where(eq(s.events.id, id));
    if (ev.automationKey?.endsWith(":tournage") && ev.episodeId) await db.update(s.episodes).set({ shootDate: startsAt }).where(eq(s.episodes.id, ev.episodeId));
    await audit({ userId: u.id, action: "evenement.deplacement", entityType: "event", entityId: id, summary: `« ${ev.title} » déplacé au ${d}` });
    return { ok: true as const, message: "Événement déplacé" };
  });
}

export async function deleteEvent(id: string) {
  return run(async () => {
    const u = await assertPermission("calendrier.modifier");
    const [ev] = await db.delete(s.events).where(eq(s.events.id, id)).returning();
    if (ev) await audit({ userId: u.id, action: "evenement.suppression", entityType: "event", entityId: id, summary: `Événement « ${ev.title} » supprimé` });
    return { ok: true as const, message: "Événement supprimé" };
  });
}
