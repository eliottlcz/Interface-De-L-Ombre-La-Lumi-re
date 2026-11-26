import "server-only";
import postgres from "postgres";

/**
 * Écoute du canal Postgres `dlal_changes` (un seul abonnement LISTEN par instance serveur),
 * puis diffusion aux connexions SSE ouvertes. Nécessite une connexion directe (pas le pooler
 * en mode transaction) : DATABASE_URL_DIRECT si défini, sinon DATABASE_URL.
 */
type Listener = (payload: string) => void;
declare global {
  // eslint-disable-next-line no-var
  var __dlalRealtime: { listeners: Set<Listener>; started: Promise<void> | null; sql: ReturnType<typeof postgres> | null } | undefined;
}
const state = (globalThis.__dlalRealtime ??= { listeners: new Set(), started: null, sql: null });

function ensureStarted() {
  if (state.started) return state.started;
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!;
  state.sql = postgres(url, { max: 1, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require" });
  state.started = state.sql.listen("dlal_changes", (payload) => {
    for (const l of state.listeners) l(payload);
  }).then(() => undefined).catch((e) => {
    console.error("[realtime] LISTEN impossible", e.message);
    state.started = null;
    throw e;
  });
  return state.started;
}

export async function subscribe(l: Listener): Promise<() => void> {
  await ensureStarted();
  state.listeners.add(l);
  return () => { state.listeners.delete(l); };
}
