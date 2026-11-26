/** Données de référence (pas de données fictives) : modèles de checklists issus du cahier des charges. */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema";

export const CHECKLIST_TEMPLATES = [
  { name: "Avant tournage", phase: "avant", items: [
    "Confirmer l'invité", "Préparer les questions", "Vérifier le studio", "Préparer les caméras", "Préparer les micros",
    "Vérifier les batteries", "Vérifier les cartes mémoire", "Installer les lumières", "Préparer les autorisations", "Vérifier le décor",
  ] },
  { name: "Après tournage", phase: "apres", items: [
    "Sauvegarder les rushs", "Vérifier les fichiers audio", "Organiser les fichiers", "Transmettre les éléments au montage", "Remercier l'invité",
  ] },
] as const;

export async function seedReferenceData(db: PostgresJsDatabase<typeof schema>) {
  for (const t of CHECKLIST_TEMPLATES) {
    const existing = await db.select().from(schema.checklists).where(eq(schema.checklists.name, t.name));
    if (existing.some((c) => c.isTemplate)) continue;
    const [cl] = await db.insert(schema.checklists).values({ name: t.name, phase: t.phase, isTemplate: true }).returning();
    await db.insert(schema.checklistItems).values(t.items.map((label, i) => ({ checklistId: cl.id, label, position: i })));
  }
}
