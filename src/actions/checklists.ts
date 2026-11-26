"use server";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";

const label = z.string().trim().min(1, "Libellé vide").max(300);

export async function createChecklist(input: { name: string; phase: "avant" | "apres" | "autre"; isTemplate: boolean; episodeId?: string | null; items?: string[] }) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const name = z.string().trim().min(1, "Nom obligatoire").max(200).parse(input.name);
    const [cl] = await db.insert(s.checklists).values({ name, phase: input.phase, isTemplate: input.isTemplate, episodeId: input.episodeId || null, createdBy: u.id }).returning();
    const items = (input.items ?? []).map((x) => x.trim()).filter(Boolean);
    if (items.length) await db.insert(s.checklistItems).values(items.map((l, i) => ({ checklistId: cl.id, label: l.slice(0, 300), position: i })));
    await audit({ userId: u.id, action: "checklist.creation", entityType: "checklist", entityId: cl.id, summary: `Checklist « ${name} » créée` });
    return { ok: true as const, data: cl.id, message: "Checklist créée" };
  });
}

/** Duplique une checklist (modèle ou non) — optionnellement pour un épisode. */
export async function duplicateChecklist(id: string, opts: { episodeId?: string | null; asTemplate?: boolean; name?: string }) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [src] = await db.select().from(s.checklists).where(eq(s.checklists.id, id));
    if (!src) userError("Checklist introuvable");
    const items = await db.select().from(s.checklistItems).where(eq(s.checklistItems.checklistId, id)).orderBy(s.checklistItems.position);
    let eventId: string | null = null;
    if (opts.episodeId) {
      const [ev] = await db.select({ id: s.events.id }).from(s.events).where(and(eq(s.events.episodeId, opts.episodeId), eq(s.events.type, "tournage"))).limit(1);
      eventId = ev?.id ?? null;
    }
    const [cl] = await db.insert(s.checklists).values({
      name: opts.name?.trim() || (opts.asTemplate ? `${src.name} (copie)` : src.name), phase: src.phase, isTemplate: Boolean(opts.asTemplate),
      episodeId: opts.episodeId || null, eventId, sourceTemplateId: src.isTemplate ? src.id : src.sourceTemplateId, createdBy: u.id,
    }).returning();
    if (items.length) await db.insert(s.checklistItems).values(items.map((it) => ({ checklistId: cl.id, label: it.label, position: it.position })));
    await audit({ userId: u.id, action: "checklist.duplication", entityType: "checklist", entityId: cl.id, summary: `Checklist « ${src.name} » dupliquée` });
    return { ok: true as const, data: cl.id, message: "Checklist dupliquée" };
  });
}

export async function renameChecklist(id: string, name: string) {
  return run(async () => {
    await assertPermission("production.modifier");
    await db.update(s.checklists).set({ name: z.string().trim().min(1).max(200).parse(name), updatedAt: new Date() }).where(eq(s.checklists.id, id));
    return { ok: true as const };
  });
}

export async function deleteChecklist(id: string) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    const [cl] = await db.delete(s.checklists).where(eq(s.checklists.id, id)).returning();
    if (cl) await audit({ userId: u.id, action: "checklist.suppression", entityType: "checklist", entityId: id, summary: `Checklist « ${cl.name} » supprimée` });
    return { ok: true as const, message: "Checklist supprimée" };
  });
}

export async function toggleChecklistItem(id: string, done: boolean) {
  return run(async () => {
    const u = await assertPermission("production.modifier");
    await db.update(s.checklistItems).set({ done, doneBy: done ? u.id : null, doneAt: done ? new Date() : null }).where(eq(s.checklistItems.id, id));
    return { ok: true as const };
  });
}

export async function addChecklistItem(checklistId: string, text: string) {
  return run(async () => {
    await assertPermission("production.modifier");
    const [{ m }] = await db.select({ m: max(s.checklistItems.position) }).from(s.checklistItems).where(eq(s.checklistItems.checklistId, checklistId));
    await db.insert(s.checklistItems).values({ checklistId, label: label.parse(text), position: (m ?? -1) + 1 });
    return { ok: true as const };
  });
}

export async function updateChecklistItem(id: string, text: string) {
  return run(async () => {
    await assertPermission("production.modifier");
    await db.update(s.checklistItems).set({ label: label.parse(text) }).where(eq(s.checklistItems.id, id));
    return { ok: true as const };
  });
}

export async function deleteChecklistItem(id: string) {
  return run(async () => {
    await assertPermission("production.modifier");
    await db.delete(s.checklistItems).where(eq(s.checklistItems.id, id));
    return { ok: true as const };
  });
}

export async function moveChecklistItem(id: string, dir: -1 | 1) {
  return run(async () => {
    await assertPermission("production.modifier");
    const [it] = await db.select().from(s.checklistItems).where(eq(s.checklistItems.id, id));
    if (!it) userError("Élément introuvable");
    const siblings = await db.select().from(s.checklistItems).where(eq(s.checklistItems.checklistId, it.checklistId)).orderBy(s.checklistItems.position);
    const i = siblings.findIndex((x) => x.id === id); const j = i + dir;
    if (j < 0 || j >= siblings.length) return { ok: true as const };
    const order = [...siblings]; [order[i], order[j]] = [order[j], order[i]];
    for (const [k, x] of order.entries()) await db.update(s.checklistItems).set({ position: k }).where(eq(s.checklistItems.id, x.id));
    return { ok: true as const };
  });
}
