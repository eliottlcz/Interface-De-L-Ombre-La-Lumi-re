import "server-only";
import { and, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { addDaysISO, todayISO, diffDaysISO, utcToParis } from "@/lib/dates";
import { CONTENT_KIND, EPISODE_STAGE, GUEST_DOC_KIND, GUEST_DOC_STATUS, PRIORITY } from "@/lib/labels";

import { REMINDER_LABEL as _RL, type Reminder, type Urgency, type ReminderKind } from "@/lib/reminder-labels";
export const REMINDER_LABEL = _RL;
export type { Reminder, Urgency, ReminderKind };

function urgencyOf(date: string | null, today: string): Urgency {
  if (!date) return "sans_date";
  const d = diffDaysISO(date, today);
  if (d < 0) return "retard";
  if (d === 0) return "aujourdhui";
  if (d <= 7) return "semaine";
  return "plus_tard";
}

/** Rassemble automatiquement toutes les échéances visibles par l'utilisateur. */
export async function getReminders(user: CurrentUser): Promise<Reminder[]> {
  const today = todayISO();
  const in14 = addDaysISO(today, 14);
  const out: Reminder[] = [];
  const push = (r: Omit<Reminder, "urgency">) => out.push({ ...r, urgency: urgencyOf(r.date, today) });

  if (can(user, "crm.voir")) {
    const cs = await db.select().from(s.contacts).where(and(isNull(s.contacts.archivedAt), ne(s.contacts.category, "invite_recu")));
    for (const c of cs) {
      const name = `${c.firstName} ${c.lastName}`.trim();
      if (c.category === "a_contacter") {
        push({ key: `c:${c.id}`, kind: "a_contacter", title: name, detail: [c.profession, `priorité ${PRIORITY[c.priority].toLowerCase()}`].filter(Boolean).join(" · "), date: c.nextFollowupAt, ownerId: c.ownerId, href: `/crm/${c.id}` });
      } else if (c.nextFollowupAt && c.nextFollowupAt <= in14) {
        push({ key: `r:${c.id}`, kind: "relance", title: `Relancer ${name}`, detail: `${c.followupCount} relance(s) · ${c.nextAction ?? "prochaine action à définir"}`, date: c.nextFollowupAt, ownerId: c.ownerId, href: `/crm/${c.id}` });
      } else if (c.category === "mail_envoye" && !c.responseReceived) {
        push({ key: `w:${c.id}`, kind: "reponse_attente", title: name, detail: c.lastEmailSubject ? `« ${c.lastEmailSubject} »` : "Mail envoyé", date: c.nextFollowupAt, ownerId: c.ownerId, href: `/crm/${c.id}` });
      }
    }
  }

  if (can(user, "production.voir")) {
    const eps = await db.select().from(s.episodes).where(isNull(s.episodes.archivedAt));
    const epIds = eps.map((e) => e.id);
    const lists = epIds.length ? await db.select({
      episodeId: s.checklists.episodeId, phase: s.checklists.phase,
      total: sql<number>`count(${s.checklistItems.id})::int`, done: sql<number>`count(*) filter (where ${s.checklistItems.done})::int`,
    }).from(s.checklists).leftJoin(s.checklistItems, eq(s.checklistItems.checklistId, s.checklists.id))
      .where(inArray(s.checklists.episodeId, epIds)).groupBy(s.checklists.id) : [];
    for (const e of eps) {
      const label = (e.number ? `Ép. ${String(e.number).padStart(2, "0")} — ` : "") + e.title;
      const shoot = e.shootDate ? utcToParis(e.shootDate).date : null;
      if (shoot && shoot >= today && shoot <= in14) {
        push({ key: `t:${e.id}`, kind: "tournage", title: `Tournage — ${label}`, detail: e.shootLocation ?? undefined, date: shoot, ownerId: e.producerId, href: `/production/${e.id}` });
        const avant = lists.filter((l) => l.episodeId === e.id && l.phase === "avant");
        const incomplete = avant.length === 0 || avant.some((l) => l.done < l.total);
        if (incomplete) {
          const pct = avant.length ? Math.round(100 * avant.reduce((a, l) => a + l.done, 0) / Math.max(1, avant.reduce((a, l) => a + l.total, 0))) : 0;
          push({ key: `p:${e.id}`, kind: "preparation", title: `Préparation — ${label}`, detail: avant.length ? `Checklist avant tournage à ${pct} %` : "Aucune checklist avant tournage", date: shoot, ownerId: e.producerId, href: `/production/${e.id}#checklists` });
        }
      }
      if (e.stage === "tournage_realise" || e.stage === "montage")
        push({ key: `m:${e.id}`, kind: "montage", title: `Montage — ${label}`, detail: EPISODE_STAGE[e.stage], date: e.plannedPublishDate, ownerId: e.producerId, href: `/production/${e.id}` });
      if (e.stage === "validation")
        push({ key: `v:${e.id}`, kind: "validation", title: `Valider — ${label}`, date: e.plannedPublishDate, ownerId: e.producerId, href: `/production/${e.id}` });
      if ((e.stage === "habillage" || e.stage === "programmation") && !e.publishedAt)
        push({ key: `pub:${e.id}`, kind: "publication", title: `Programmer — ${label}`, detail: EPISODE_STAGE[e.stage], date: e.plannedPublishDate, ownerId: e.producerId, href: `/production/${e.id}` });
    }
    const cts = await db.select().from(s.contents).where(inArray(s.contents.status, ["a_produire", "en_montage", "a_valider"]));
    for (const c of cts) {
      if (c.status === "a_valider") push({ key: `cv:${c.id}`, kind: "validation", title: `Valider — ${c.title}`, detail: CONTENT_KIND[c.kind], date: c.plannedDate, ownerId: c.ownerId, href: c.episodeId ? `/production/${c.episodeId}#contenus` : "/contenus" });
      else if (c.plannedDate && c.plannedDate <= in14) push({ key: `cp:${c.id}`, kind: "publication", title: c.title, detail: `${CONTENT_KIND[c.kind]} · à programmer`, date: c.plannedDate, ownerId: c.ownerId, href: c.episodeId ? `/production/${c.episodeId}#contenus` : "/contenus" });
    }
    const docs = await db.select({ d: s.guestDocuments, c: s.contacts }).from(s.guestDocuments)
      .innerJoin(s.contacts, eq(s.contacts.id, s.guestDocuments.contactId))
      .where(inArray(s.guestDocuments.status, ["manquant", "demande", "recu"]));
    for (const { d, c } of docs) {
      push({ key: `a:${d.id}`, kind: "autorisation", title: `${GUEST_DOC_KIND[d.kind]} — ${c.firstName} ${c.lastName}`.trim(), detail: GUEST_DOC_STATUS[d.status], date: null, ownerId: c.ownerId, href: `/crm/${c.id}#documents` });
    }
  }

  if (can(user, "taches.voir")) {
    const ts = await db.select().from(s.tasks).where(and(ne(s.tasks.status, "termine"), lte(s.tasks.dueDate, in14)));
    for (const t of ts) {
      const late = t.dueDate! < today;
      push({ key: `task:${t.id}`, kind: late ? "tache_retard" : "tache_echeance", title: t.title, detail: `Priorité ${PRIORITY[t.priority].toLowerCase()}`, date: t.dueDate, ownerId: t.assigneeId, href: `/missions?tache=${t.id}` });
    }
  }

  if (can(user, "finances.voir")) {
    const fs = await db.select().from(s.transactions).where(and(eq(s.transactions.status, "a_regler"), or(isNull(s.transactions.dueDate), lte(s.transactions.dueDate, addDaysISO(today, 30)))));
    for (const f of fs) push({ key: `f:${f.id}`, kind: "finance", title: f.description, detail: `${(f.amountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} à régler`, date: f.dueDate, ownerId: f.ownerId, href: `/finances?op=${f.id}` });
  }

  const rank: Record<Urgency, number> = { retard: 0, aujourdhui: 1, semaine: 2, plus_tard: 3, sans_date: 4 };
  out.sort((a, b) => rank[a.urgency] - rank[b.urgency] || (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  return out;
}

/** Nombre d'éléments urgents (en retard ou du jour) pour le badge du menu. */
export async function countUrgent(user: CurrentUser) {
  const r = await getReminders(user);
  return r.filter((x) => x.urgency === "retard" || x.urgency === "aujourdhui").length;
}

