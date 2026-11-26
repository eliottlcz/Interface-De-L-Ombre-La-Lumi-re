import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id — paramètres OWASP (m=19 Mio, t=2, p=1)
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(password: string) {
  return hash(password, OPTS);
}
export async function verifyPassword(hashStr: string, password: string) {
  try { return await verify(hashStr, password); } catch { return false; }
}

/** Politique : 10 caractères minimum, au moins une lettre et un chiffre. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (pw.length > 200) return "Mot de passe trop long.";
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  return null;
}
