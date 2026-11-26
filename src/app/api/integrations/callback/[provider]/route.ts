import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { CONNECTORS, isConnectorId, runSync } from "@/lib/integrations/connectors";
import { googleExchange } from "@/lib/integrations/google";

/** Retour OAuth : vérifie l'état (même utilisateur, < 15 min, usage unique), échange le code, chiffre les jetons. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const back = (q: string) => redirect(`/parametres?onglet=integrations&${q}`);
  const u = await getCurrentUser();
  if (!u) redirect("/connexion");
  const err = url.searchParams.get("error");
  if (err) back(`erreur=${encodeURIComponent(err)}`);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const [st] = await db.select().from(s.oauthStates).where(and(eq(s.oauthStates.state, state), eq(s.oauthStates.provider, provider), eq(s.oauthStates.userId, u.id), gt(s.oauthStates.createdAt, new Date(Date.now() - 15 * 60_000))));
  await db.delete(s.oauthStates).where(eq(s.oauthStates.state, state));
  if (!st || !code) back("erreur=etat_invalide");
  let failure: string | null = null;
  try {
    if (provider === "google_drive") await googleExchange("google_drive", code, st.codeVerifier ?? "", u.id);
    else if (isConnectorId(provider)) await CONNECTORS[provider].exchange(code, st.codeVerifier ?? "", u.id);
    else return new Response("Intégration inconnue", { status: 404 });
  } catch (e) { failure = (e as Error).message; }
  if (failure) { await audit({ userId: u.id, action: "integration.echec", sensitive: true, summary: `Échec de connexion ${provider} : ${failure.slice(0, 200)}` }); back(`erreur=${encodeURIComponent(failure.slice(0, 180))}`); }
  await audit({ userId: u.id, action: "integration.connexion", sensitive: true, summary: `Intégration connectée : ${provider}` });
  if (isConnectorId(provider)) await runSync(provider);
  back(`connecte=${provider}`);
}
