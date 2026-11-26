import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement symétrique AES-256-GCM pour les secrets (coffre-fort, jetons OAuth).
 * Clé maître : VAULT_MASTER_KEY (32 octets en base64), uniquement côté serveur.
 * Format stocké : v<version>:<iv b64>:<tag b64>:<ciphertext b64>
 */
function masterKey(): Buffer {
  const raw = process.env.VAULT_MASTER_KEY;
  if (!raw) throw new Error("VAULT_MASTER_KEY n'est pas configurée : le chiffrement est indisponible.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("VAULT_MASTER_KEY doit faire 32 octets encodés en base64.");
  return key;
}

export const KEY_VERSION = 1;

export function encryptSecret(plain: string, aad = "dlal"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${KEY_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string, aad = "dlal"): string {
  const [v, ivB, tagB, encB] = payload.split(":");
  if (v !== `v${KEY_VERSION}` || !ivB || !tagB || encB === undefined) throw new Error("Format de secret inconnu");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  try { masterKey(); return true; } catch { return false; }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
