"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const optUuid = z.preprocess((v) => (v === "" || v === "commune" ? null : v), z.uuid().nullable().optional());
const optDate = z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullable().optional());

const TaskInput = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(300),
  description: z.string().max(20000).optional().nullable(),
  assigneeId: optUuid,
  priority: z.enum(["basse", "normale", "haute", "urgente"]).default("normale"),
  status: z.enum(["a_faire", "en_cours", "en_attente", "termine"]).default("a_faire"),
  dueDate: optDate,
  contactId: optUuid,
  episodeId: optUuid,
});
export type TaskInputT = z.input<typeof TaskInput>;

export async function createTask(input: TaskInputT) {
  return run(async () => {
    const u = await assertPermission("taches.modifier");
    const v = TaskInput.parse(input);
    const [t] = await db.insert(s.tasks).values({ ...v, createdBy: u.id, completedAt: v.status === "termine" ? new Date() : null }).returning();
    await audit({ userId: u.id, action: "tache.creation", entityType: "task", entityId: t.id, summary: `Tâche « ${t.title} » créée` });
    if (t.assigneeId && t.assigneeId !== u.id)
      await notify({ userIds: [t.assigneeId], type: "tache_attribuee", title: `${u.name} vous a attribué une tâche`, body: t.title, link: `/missions?tache=${t.id}`, actorId: u.id });
    return { ok: true as const, data: t.id, message: "Tâche créée" };
  });
}

export async function updateTask(id: string, input: TaskInputT) {
  return run(async () => {
    const u = await assertPermission("taches.modifier");
    const v = TaskInput.parse(input);
    const [before] = await db.select().from(s.tasks).where(eq(s.tasks.id, id));
    if (!before) userError("Tâche introuvable");
    const completedAt = v.status === "termine" ? before.completedAt ?? new Date() : null;
    const [t] = await db.update(s.tasks).set({ ...v, completedAt, updatedAt: new Date() }).where(eq(s.tasks.id, id)).returning();
    await audit({ userId: u.id, action: "tache.modification", entityType: "task", entityId: id, summary: `Tâche « ${t.title} » modifiée` });
    if (t.assigneeId && t.assigneeId !== before.assigneeId && t.assigneeId !== u.id)
      await notify({ userIds: [t.assigneeId], type: "tache_attribuee", title: `${u.name} vous a attribué une tâche`, body: t.title, link: `/missions?tache=${t.id}`, actorId: u.id });
    if (t.status === "termine" && before.status !== "termine") await notifyDone(t, u);
    return { ok: true as const, message: "Tâche enregistrée" };
  });
}

async function notifyDone(t: typeof s.tasks.$inferSelect, u: { id: string; name: string }) {
  await notify({ userIds: [t.createdBy, t.assigneeId], type: "tache_terminee", title: `${u.name} a terminé une tâche`, body: t.title, link: `/missions?tache=${t.id}`, actorId: u.id });
}

export async function setTaskStatus(id: string, status: "a_faire" | "en_cours" | "en_attente" | "termine") {
  return run(async () => {
    const u = await assertPermission("taches.modifier");
    const [before] = await db.select().from(s.tasks).where(eq(s.tasks.id, id));
    if (!before) userError("Tâche introuvable");
    const [t] = await db.update(s.tasks).set({ status, completedAt: status === "termine" ? new Date() : null, updatedAt: new Date() }).where(eq(s.tasks.id, id)).returning();
    await audit({ userId: u.id, action: "tache.statut", entityType: "task", entityId: id, summary: `« ${t.title} » → ${status}` });
    if (status === "termine" && before.status !== "termine") await notifyDone(t, u);
    return { ok: true as const };
  });
}

export async function deleteTask(id: string) {
  return run(async () => {
    const u = await assertPermission("taches.modifier");
    const [t] = await db.select().from(s.tasks).where(eq(s.tasks.id, id));
    if (!t) userError("Tâche introuvable");
    if (t.createdBy !== u.id && !can(u, "taches.supprimer_toutes")) userError("Vous ne pouvez supprimer que les tâches que vous avez créées.");
    await db.delete(s.attachments).where(and(eq(s.attachments.entityType, "task"), eq(s.attachments.entityId, id)));
    await db.delete(s.tasks).where(eq(s.tasks.id, id));
    await audit({ userId: u.id, action: "tache.suppression", entityType: "task", entityId: id, summary: `Tâche « ${t.title} » supprimée`, metadata: { title: t.title, assigneeId: t.assigneeId, dueDate: t.dueDate } });
    return { ok: true as const, message: "Tâche supprimée" };
  });
}

export async function addTaskComment(taskId: string, body: string) {
  return run(async () => {
    const u = await assertPermission("taches.voir");
    const text = z.string().trim().min(1, "Commentaire vide").max(5000).parse(body);
    const [t] = await db.select().from(s.tasks).where(eq(s.tasks.id, taskId));
    if (!t) userError("Tâche introuvable");
    await db.insert(s.taskComments).values({ taskId, userId: u.id, body: text });
    await notify({ userIds: [t.assigneeId, t.createdBy], type: "commentaire", title: `${u.name} a commenté « ${t.title} »`, body: text.slice(0, 140), link: `/missions?tache=${t.id}`, actorId: u.id });
    return { ok: true as const };
  });
}
