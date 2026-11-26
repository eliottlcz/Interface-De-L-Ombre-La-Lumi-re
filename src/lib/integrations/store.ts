import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export type ProviderId = "google_drive" | "youtube" | "instagram" | "tiktok" | "ai";

/** Les jetons OAuth sont toujours chiffrés en base et ne quittent jamais le serveur. */
export async function getIntegration(provider: ProviderId) {
  const [row] = await db.select().from(schema.integrations).where(eq(schema.integrations.provider, provider)).limit(1);
  return row ?? null;
}

export async function saveTokens(provider: ProviderId, t: {
  accessToken: string; refreshToken?: string | null; expiresIn?: number | null; scopes?: string; accountLabel?: string; meta?: Record<string, unknown>; userId?: string;
}) {
  const existing = await getIntegration(provider);
  const values = {
    provider,
    accessTokenEnc: encryptSecret(t.accessToken, `oauth:${provider}`),
    refreshTokenEnc: t.refreshToken ? encryptSecret(t.refreshToken, `oauth:${provider}`) : existing?.refreshTokenEnc ?? null,
    expiresAt: t.expiresIn ? new Date(Date.now() + (t.expiresIn - 60) * 1000) : null,
    scopes: t.scopes ?? existing?.scopes ?? null,
    accountLabel: t.accountLabel ?? existing?.accountLabel ?? null,
    meta: { ...(existing?.meta ?? {}), ...(t.meta ?? {}) },
    connectedBy: t.userId ?? existing?.connectedBy ?? null,
    connectedAt: existing?.connectedAt ?? new Date(),
    lastError: null,
    updatedAt: new Date(),
  };
  if (existing) await db.update(schema.integrations).set(values).where(eq(schema.integrations.id, existing.id));
  else await db.insert(schema.integrations).values(values);
}

export function readToken(enc: string | null, provider: ProviderId) {
  return enc ? decryptSecret(enc, `oauth:${provider}`) : null;
}

export async function setIntegrationError(provider: ProviderId, message: string | null) {
  await db.update(schema.integrations).set({ lastError: message, updatedAt: new Date() }).where(eq(schema.integrations.provider, provider));
}
export async function markSynced(provider: ProviderId) {
  await db.update(schema.integrations).set({ lastSyncAt: new Date(), lastError: null }).where(eq(schema.integrations.provider, provider));
}
export async function disconnect(provider: ProviderId) {
  await db.delete(schema.integrations).where(eq(schema.integrations.provider, provider));
}
