import "server-only";
import { appUrl } from "@/lib/mail";
import { getIntegration, readToken, saveTokens, setIntegrationError, type ProviderId } from "./store";

/** OAuth Google (Drive + YouTube) — un seul client OAuth, deux connexions distinctes. */
export const GOOGLE_SCOPES: Record<"google_drive" | "youtube", string[]> = {
  google_drive: ["https://www.googleapis.com/auth/drive", "openid", "email"],
  youtube: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly", "openid", "email"],
};

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
export function googleRedirect(provider: "google_drive" | "youtube") {
  return appUrl(`/api/integrations/callback/${provider}`);
}
export function googleAuthUrl(provider: "google_drive" | "youtube", state: string, challenge: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: googleRedirect(provider), response_type: "code",
    scope: GOOGLE_SCOPES[provider].join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true",
    state, code_challenge: challenge, code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}
export async function googleExchange(provider: "google_drive" | "youtube", code: string, verifier: string, userId: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: googleRedirect(provider), grant_type: "authorization_code", code_verifier: verifier }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Google OAuth : ${j.error_description ?? j.error ?? res.status}`);
  let email: string | undefined;
  try {
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${j.access_token}` } }).then((r) => r.json());
    email = info.email;
  } catch { /* facultatif */ }
  await saveTokens(provider, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in, scopes: j.scope, accountLabel: email, userId });
}

/** Renvoie un jeton d'accès valide (rafraîchi si nécessaire) ou null si non connecté. */
export async function googleAccessToken(provider: ProviderId & ("google_drive" | "youtube")): Promise<string | null> {
  const row = await getIntegration(provider);
  if (!row?.accessTokenEnc) return null;
  if (row.expiresAt && row.expiresAt.getTime() > Date.now()) return readToken(row.accessTokenEnc, provider);
  const refresh = readToken(row.refreshTokenEnc, provider);
  if (!refresh || !googleConfigured()) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await res.json();
  if (!res.ok) {
    await setIntegrationError(provider, `Renouvellement du jeton refusé (${j.error ?? res.status}). Reconnectez le compte.`);
    return null;
  }
  await saveTokens(provider, { accessToken: j.access_token, expiresIn: j.expires_in });
  return j.access_token;
}
