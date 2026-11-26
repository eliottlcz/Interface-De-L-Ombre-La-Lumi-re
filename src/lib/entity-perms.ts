import type { Permission } from "@/lib/auth/permissions";
export type EntityType = "task" | "contact" | "episode" | "transaction" | "guest_doc" | "resource" | "content";
export const ENTITY_PERMS: Record<EntityType, { read: Permission; write: Permission }> = {
  task: { read: "taches.voir", write: "taches.modifier" },
  contact: { read: "crm.voir", write: "crm.modifier" },
  episode: { read: "production.voir", write: "production.modifier" },
  content: { read: "production.voir", write: "production.modifier" },
  guest_doc: { read: "production.voir", write: "production.modifier" },
  transaction: { read: "finances.voir", write: "finances.modifier" },
  resource: { read: "ressources.voir", write: "ressources.modifier" },
};
export const isEntityType = (t: string): t is EntityType => t in ENTITY_PERMS;
