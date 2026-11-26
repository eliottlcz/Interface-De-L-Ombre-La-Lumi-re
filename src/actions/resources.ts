"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";

const blank = (v: unknown) => (v === "" ? null : v);
const ResInput = z.object({
  section: z.enum(["identite", "documents", "communication", "production"]),
  category: z.preprocess(blank, z.string().max(80).nullable().optional()),
  title: z.string().trim().min(1, "Le titre est obligatoire").max(300),
  description: z.preprocess(blank, z.string().max(5000).nullable().optional()),
  body: z.preprocess(blank, z.string().max(50000).nullable().optional()),
  url: z.preprocess(blank, z.url({ message: "Lien invalide" }).nullable().optional()),
  restricted: z.boolean().default(false),
});
export type ResInputT = z.input<typeof ResInput>;

export async function saveResource(id: string | null, input: ResInputT) {
  return run(async () => {
    const u = await assertPermission("ressources.modifier");
    const v = ResInput.parse(input);
    if (v.restricted && !can(u, "ressources.restreintes")) userError("Vous ne pouvez pas créer de ressource restreinte.");
    let rid = id;
    if (id) {
      const [before] = await db.select().from(s.resources).where(eq(s.resources.id, id));
      if (before?.restricted && !can(u, "ressources.restreintes")) userError("Ressource restreinte.");
      await db.update(s.resources).set({ ...v, updatedAt: new Date() }).where(eq(s.resources.id, id));
    } else { const [r] = await db.insert(s.resources).values({ ...v, createdBy: u.id }).returning(); rid = r.id; }
    await audit({ userId: u.id, action: id ? "ressource.modification" : "ressource.ajout", entityType: "resource", entityId: rid, summary: `Ressource « ${v.title} »` });
    return { ok: true as const, data: rid!, message: "Ressource enregistrée" };
  });
}
export async function deleteResource(id: string) {
  return run(async () => {
    const u = await assertPermission("ressources.modifier");
    const [r] = await db.select().from(s.resources).where(eq(s.resources.id, id));
    if (r?.restricted && !can(u, "ressources.restreintes")) userError("Ressource restreinte.");
    await db.delete(s.resources).where(eq(s.resources.id, id));
    if (r) await audit({ userId: u.id, action: "ressource.suppression", entityType: "resource", entityId: id, summary: `Ressource « ${r.title} » supprimée` });
    return { ok: true as const, message: "Ressource supprimée" };
  });
}
