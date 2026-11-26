import "server-only";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Enveloppe une action serveur : transforme les erreurs connues en message lisible. */
export async function run<T>(fn: () => Promise<T | ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "ok" in (r as object)) return r as ActionResult<T>;
    return { ok: true, data: r as T };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(" · ") };
    const err = e as { code?: string; constraint_name?: string; message?: string };
    if (err?.code === "23505") return { ok: false, error: duplicateMessage(err.constraint_name) };
    if (err?.code === "23514") return { ok: false, error: checkMessage(err.constraint_name) };
    if ((e as Error)?.message === "NEXT_REDIRECT") throw e;
    console.error("[action]", e);
    return { ok: false, error: (e as Error)?.message?.startsWith("⚠") ? (e as Error).message.slice(1).trim() : "Une erreur inattendue est survenue. Elle a été journalisée côté serveur." };
  }
}

/** Erreur métier à afficher telle quelle à l'utilisateur. */
export function userError(msg: string): never {
  throw new Error("⚠ " + msg);
}

function duplicateMessage(c?: string) {
  if (c === "contacts_email_unique") return "Un contact avec cette adresse e-mail existe déjà (doublon évité).";
  if (c === "users_email_unique") return "Un utilisateur avec cette adresse e-mail existe déjà.";
  if (c === "episodes_number_unique") return "Ce numéro d'épisode est déjà utilisé.";
  return "Cet élément existe déjà.";
}
function checkMessage(c?: string) {
  if (c === "guest_doc_proof_required") return "Un document ne peut pas être marqué reçu ou validé sans preuve (fichier ou lien).";
  if (c === "amount_positive") return "Le montant doit être supérieur à zéro.";
  return "Donnée invalide.";
}
