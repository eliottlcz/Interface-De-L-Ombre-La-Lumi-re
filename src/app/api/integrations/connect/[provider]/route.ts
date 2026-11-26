import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { randomToken } from "@/lib/crypto";
import { CONNECTORS, isConnectorId } from "@/lib/integrations/connectors";
import { googleAuthUrl, googleConfigured } from "@/lib/integrations/google";

/** Démarre une connexion OAuth (état anti-CSRF + PKCE, stockés côté serveur). */
export async function GET(_: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const u = await getCurrentUser();
  if (!u) redirect("/connexion");
  if (!can(u, "integrations.gerer")) return new Response("Accès refusé", { status: 403 });
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let url: string;
  if (provider === "google_drive") {
    if (!googleConfigured()) redirect("/parametres?onglet=integrations&erreur=google_non_configure");
    url = googleAuthUrl("google_drive", state, challenge);
  } else if (isConnectorId(provider)) {
    if (!CONNECTORS[provider].isConfigured()) redirect(`/parametres?onglet=integrations&erreur=${provider}_non_configure`);
    url = CONNECTORS[provider].authUrl(state, challenge);
  } else return new Response("Intégration inconnue", { status: 404 });
  await db.insert(s.oauthStates).values({ state, provider, userId: u.id, codeVerifier: verifier });
  redirect(url);
}
