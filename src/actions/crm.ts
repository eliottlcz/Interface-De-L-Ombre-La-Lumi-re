"use server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { notify, notifyAll } from "@/lib/notify";
import { addDaysISO, parisToUtc, todayISO } from "@/lib/dates";
import { CONTACT_CATEGORY } from "@/lib/labels";
import { onGuestConfirmed } from "@/lib/automations";
import { folderIdFromUrl } from "@/lib/integrations/drive";

const blank = (v: unknown) => (v === "" ? null : v);
const optStr = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable().optional());
const optDate = z.preprocess(blank, z.iso.date().nullable().optional());
const optUuid = z.preprocess(blank, z.uuid().nullable().optional());

const ContactInput = z.object({
  firstName: z.string().trim().min(1, "Le prénom (ou le nom) est obligatoire").max(120),
  lastName: z.string().trim().max(120).default(""),
  profession: optStr(200), company: optStr(200),
  email: z.preprocess(blank, z.email({ message: "Adresse e-mail invalide" }).nullable().optional()),
  phone: optStr(60),
  socials: z.object({ instagram: z.string().optional(), tiktok: z.string().optional(), linkedin: z.string().optional(), youtube: z.string().optional(), x: z.string().optional(), site: z.string().optional() }).partial().default({}),
  category: z.enum(["a_contacter", "mail_envoye", "a_relancer", "invite_recu"]).default("a_contacter"),
  priority: z.enum(["basse", "normale", "haute", "urgente"]).default("normale"),
  ownerId: optUuid,
  whyInteresting: optStr(5000), notes: optStr(20000),
  lastEmailSubject: optStr(300), nextAction: optStr(500),
  nextFollowupAt: optDate, shootDate: optDate, publishDate: optDate,
  episodeUrl: optStr(1000), driveFolderUrl: optStr(1000),
  responseReceived: z.boolean().optional(),
});
export type ContactInputT = z.input<typeof ContactInput>;

function cleanSocials(sx: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(sx).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v!.trim()]));
}

/** Recherche de doublons potentiels : même e-mail, ou même prénom + nom. */
export async function findDuplicates(input: { firstName: string; lastName: string; email?: string | null; excludeId?: string }) {
  await assertPermission("crm.voir");
  const name = `${input.firstName} ${input.lastName}`.trim().toLowerCase();
  const rows = await db.select({ id: s.contacts.id, firstName: s.contacts.firstName, lastName: s.contacts.lastName, email: s.contacts.email, category: s.contacts.category })
    .from(s.contacts)
    .where(and(
      input.excludeId ? ne(s.contacts.id, input.excludeId) : undefined,
      sql`(lower(trim(${s.contacts.firstName} || ' ' || ${s.contacts.lastName})) = ${name} ${input.email ? sql`or lower(${s.contacts.email}) = ${input.email.toLowerCase()}` : sql``})`,
    )).limit(5);
  return rows;
}

export async function createContact(input: ContactInputT, opts: { force?: boolean } = {}) {
  return run(async () => {
    const u = await assertPermission("crm.modifier");
    const v = ContactInput.parse(input);
    if (!opts.force) {
      const dup = await findDuplicates({ firstName: v.firstName, lastName: v.lastName, email: v.email });
      if (dup.length) {
        const d = dup[0];
        userError(`Doublon possible : « ${d.firstName} ${d.lastName} » existe déjà (${CONTACT_CATEGORY[d.category]}). Ouvrez sa fiche, ou confirmez la création.`);
      }
    }
    const [c] = await db.insert(s.contacts).values({
      ...v, socials: cleanSocials(v.socials), ownerId: v.ownerId ?? u.id, createdBy: u.id,
      driveFolderId: v.driveFolderUrl ? folderIdFromUrl(v.driveFolderUrl) : null,
    }).returning();
    await db.insert(s.contactInteractions).values({ contactId: c.id, userId: u.id, type: "note", subject: "Fiche créée", body: `Ajouté(e) dans « ${CONTACT_CATEGORY[c.category]} »` });
    await audit({ userId: u.id, action: "contact.creation", entityType: "contact", entityId: c.id, summary: `Contact « ${c.firstName} ${c.lastName} » ajouté` });
    await notifyAll({ type: "nouvel_invite", title: `Nouveau contact : ${c.firstName} ${c.lastName}`.trim(), body: c.profession ?? undefined, link: `/crm/${c.id}`, actorId: u.id });
    return { ok: true as const, data: c.id, message: "Contact ajouté" };
  });
}

export async function updateContact(id: string, input: ContactInputT) {
  return run(async () => {
    const u = await assertPermission("crm.modifier");
    const v = ContactInput.parse(input);
    const [before] = await db.select().from(s.contacts).where(eq(s.contacts.id, id));
    if (!before) userError("Contact introuvable");
    await db.update(s.contacts).set({
      ...v, socials: cleanSocials(v.socials), updatedAt: new Date(),
      driveFolderId: v.driveFolderUrl ? folderIdFromUrl(v.driveFolderUrl) : null,
    }).where(eq(s.contacts.id, id));
    if (before.category !== v.category)
      await db.insert(s.contactInteractions).values({ contactId: id, userId: u.id, type: "changement_statut", subject: `${CONTACT_CATEGORY[before.category]} → ${CONTACT_CATEGORY[v.category]}` });
    if (v.ownerId && v.ownerId !== before.ownerId)
      await notify({ userIds: [v.ownerId], type: "crm", title: `${u.name} vous a confié le contact ${v.firstName} ${v.lastName}`.trim(), link: `/crm/${id}`, actorId: u.id });
    await audit({ userId: u.id, action: "contact.modification", entityType: "contact", entityId: id, summary: `Fiche « ${v.firstName} ${v.lastName} » modifiée` });
    return { ok: true as const, message: "Fiche enregistrée" };
  });
}

export async function moveContact(id: string, category: "a_contacter" | "mail_envoye" | "a_relancer" | "invite_recu") {
  return run(async () => {
    const u = await assertPermission("crm.modifier");
    const [c] = await db.select().from(s.contacts).where(eq(s.contacts.id, id));
    if (!c) userError("Contact introuvable");
    if (c.category === category) return { ok: true as const };
    await db.update(s.contacts).set({ category, updatedAt: new Date() }).where(eq(s.contacts.id, id));
    await db.insert(s.contactInteractions).values({ contactId: id, userId: u.id, type: "changement_statut", subject: `${CONTACT_CATEGORY[c.category]} → ${CONTACT_CATEGORY[category]}` });
    await audit({ userId: u.id, action: "contact.deplacement", entityType: "contact", entityId: id, summary: `${c.firstName} ${c.lastName} → ${CONTACT_CATEGORY[category]}` });
    return { ok: true as const, message: `Déplacé vers « ${CONTACT_CATEGORY[category]} »` };
  });
}

const InteractionInput = z.object({
  type: z.enum(["mail_envoye", "relance", "reponse", "appel", "rendez_vous", "note"]),
  subject: optStr(300), body: optStr(20000),
  occurredOn: optDate,
  nextFollowupAt: optDate,
  nextAction: optStr(500),
});

/** Enregistre un échange et met à jour automatiquement la fiche (catégorie, relances…). */
export async function logInteraction(contactId: string, input: z.input<typeof InteractionInput>) {
  return run(async () => {
    const u = await assertPermission("crm.modifier");
    const v = InteractionInput.parse(input);
    const [c] = await db.select().from(s.contacts).where(eq(s.contacts.id, contactId));
    if (!c) userError("Contact introuvable");
    const day = v.occurredOn ?? todayISO();
    const occurredAt = parisToUtc(day, "12:00");
    await db.insert(s.contactInteractions).values({ contactId, userId: u.id, type: v.type, subject: v.subject, body: v.body, occurredAt });
    const patch: Partial<typeof s.contacts.$inferInsert> = { updatedAt: new Date(), nextAction: v.nextAction ?? c.nextAction };
    if (v.type === "mail_envoye") {
      Object.assign(patch, { lastContactAt: occurredAt, lastEmailSubject: v.subject ?? c.lastEmailSubject, category: c.category === "invite_recu" ? c.category : "mail_envoye", nextFollowupAt: v.nextFollowupAt ?? addDaysISO(day, 7), responseReceived: false });
    } else if (v.type === "relance") {
      Object.assign(patch, { lastContactAt: occurredAt, followupCount: c.followupCount + 1, category: c.category === "invite_recu" ? c.category : "a_relancer", nextFollowupAt: v.nextFollowupAt ?? addDaysISO(day, 7) });
    } else if (v.type === "reponse") {
      Object.assign(patch, { responseReceived: true, lastContactAt: occurredAt, nextFollowupAt: v.nextFollowupAt ?? null });
    } else {
      Object.assign(patch, { lastContactAt: ["appel", "rendez_vous"].includes(v.type) ? occurredAt : c.lastContactAt, nextFollowupAt: v.nextFollowupAt ?? c.nextFollowupAt });
    }
    await db.update(s.contacts).set(patch).where(eq(s.contacts.id, contactId));
    if (v.type === "relance" && c.ownerId && c.ownerId !== u.id)
      await notify({ userIds: [c.ownerId], type: "relance", title: `${u.name} a relancé ${c.firstName} ${c.lastName}`.trim(), link: `/crm/${contactId}`, actorId: u.id });
    await audit({ userId: u.id, action: "contact.echange", entityType: "contact", entityId: contactId, summary: `Échange (${v.type}) avec ${c.firstName} ${c.lastName}` });
    return { ok: true as const, message: v.type === "relance" ? "Relance enregistrée — prochaine relance programmée" : "Échange enregistré" };
  });
}

export async function setArchived(id: string, archived: boolean) {
  return run(async () => {
    const u = await assertPermission("crm.modifier");
    const [c] = await db.update(s.contacts).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(s.contacts.id, id)).returning();
    if (!c) userError("Contact introuvable");
    await audit({ userId: u.id, action: archived ? "contact.archivage" : "contact.desarchivage", entityType: "contact", entityId: id, summary: `${c.firstName} ${c.lastName} ${archived ? "archivé(e)" : "désarchivé(e)"}` });
    return { ok: true as const, message: archived ? "Contact archivé" : "Contact restauré" };
  });
}

export async function deleteContact(id: string) {
  return run(async () => {
    const u = await assertPermission("crm.supprimer");
    const [c] = await db.select().from(s.contacts).where(eq(s.contacts.id, id));
    if (!c) userError("Contact introuvable");
    await db.delete(s.attachments).where(and(eq(s.attachments.entityType, "contact"), eq(s.attachments.entityId, id)));
    await db.delete(s.contacts).where(eq(s.contacts.id, id));
    await audit({ userId: u.id, action: "contact.suppression", entityType: "contact", entityId: id, sensitive: true, summary: `Contact « ${c.firstName} ${c.lastName} » supprimé définitivement`, metadata: { email: c.email, category: c.category } });
    return { ok: true as const, message: "Contact supprimé" };
  });
}

/** « Confirmer l'invité » : déclenche l'automatisation complète (épisode, tâches, checklist, Drive, calendrier). */
export async function confirmGuest(contactId: string, input: { createEpisode: boolean; episodeTitle?: string; shootDate?: string; shootTime?: string; shootLocation?: string; producerId?: string; createDrive: boolean }) {
  return run(async () => {
    const u = await assertPermission("crm.modifier");
    await assertPermission("production.modifier");
    const shootDate = input.shootDate ? parisToUtc(input.shootDate, input.shootTime || "10:00") : null;
    const r = await onGuestConfirmed({
      contactId, actor: { id: u.id, name: u.name }, createEpisode: input.createEpisode, episodeTitle: input.episodeTitle,
      shootDate, shootLocation: input.shootLocation || null, producerId: input.producerId || u.id, createDrive: input.createDrive,
    });
    await audit({ userId: u.id, action: "invite.confirmation", entityType: "contact", entityId: contactId, summary: `Invité confirmé — ${r.created.length} élément(s) créé(s)`, metadata: r });
    return { ok: true as const, data: r, message: "Invité confirmé : la production est lancée" };
  });
}

/** Crée une tâche liée à un contact. */
export async function createContactTask(contactId: string, title: string, dueDate: string | null, assigneeId: string | null) {
  return run(async () => {
    const u = await assertPermission("taches.modifier");
    const t = z.string().trim().min(1, "Titre obligatoire").max(300).parse(title);
    const [task] = await db.insert(s.tasks).values({ title: t, contactId, dueDate: dueDate || null, assigneeId: assigneeId || null, createdBy: u.id }).returning();
    if (task.assigneeId && task.assigneeId !== u.id)
      await notify({ userIds: [task.assigneeId], type: "tache_attribuee", title: `${u.name} vous a attribué une tâche`, body: t, link: `/missions?tache=${task.id}`, actorId: u.id });
    return { ok: true as const, message: "Tâche créée" };
  });
}


