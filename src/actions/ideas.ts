"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { generateDailyIdeas } from "@/lib/ideas";

export async function generateIdeasNow() {
  return run(async () => {
    const u = await assertPermission("idees.generer");
    const r = await generateDailyIdeas(u.id);
    if (r.status === "non_configure" || r.status === "erreur") userError(r.message);
    await audit({ userId: u.id, action: "idees.generation", summary: r.message });
    return { ok: true as const, message: r.message };
  });
}

export async function setIdeaStatus(id: string, status: "nouvelle" | "favori" | "ignoree") {
  return run(async () => {
    await assertPermission("idees.voir");
    await db.update(s.ideas).set({ status: z.enum(["nouvelle", "favori", "ignoree"]).parse(status) }).where(eq(s.ideas.id, id));
    return { ok: true as const, message: status === "favori" ? "Ajoutée aux favoris" : status === "ignoree" ? "Idée ignorée" : "Idée restaurée" };
  });
}

export async function ideaToTask(id: string, assigneeId: string | null, dueDate: string | null) {
  return run(async () => {
    const u = await assertPermission("taches.modifier");
    const [i] = await db.select().from(s.ideas).where(eq(s.ideas.id, id));
    if (!i) userError("Idée introuvable");
    if (i.taskId) userError("Cette idée a déjà été transformée en tâche.");
    const description = [i.description, "", "Pourquoi : " + i.relevance, "", "Actions :", ...i.actions.map((a) => "- " + a), ...(i.sources.length ? ["", "Sources :", ...i.sources.map((x) => `- ${x.title} — ${x.url}`)] : [])].join("\n");
    const [t] = await db.insert(s.tasks).values({ title: i.title.slice(0, 300), description, assigneeId: assigneeId || null, dueDate: dueDate || null, createdBy: u.id, priority: "normale" }).returning();
    await db.update(s.ideas).set({ status: "transformee", taskId: t.id }).where(eq(s.ideas.id, id));
    if (t.assigneeId && t.assigneeId !== u.id) await notify({ userIds: [t.assigneeId], type: "tache_attribuee", title: `${u.name} vous a confié une idée à creuser`, body: t.title, link: `/missions?tache=${t.id}`, actorId: u.id });
    await audit({ userId: u.id, action: "idee.tache", entityType: "task", entityId: t.id, summary: `Idée transformée en tâche : ${i.title}` });
    return { ok: true as const, message: "Idée transformée en tâche" };
  });
}
