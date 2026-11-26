import { getCurrentUser } from "@/lib/auth/session";
import { subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Flux SSE : prévient le navigateur à chaque modification en base (le client se reconnecte automatiquement). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string, event = "change") => {
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${data}\n\n`)); } catch { /* fermé */ }
      };
      send("ok", "ready");
      let unsub: () => void = () => {};
      try {
        unsub = await subscribe((payload) => {
          // On ne transmet que le type de donnée modifiée, jamais son contenu.
          try { const p = JSON.parse(payload); send(JSON.stringify({ t: p.t })); } catch { send("{}"); }
        });
      } catch {
        send("indisponible", "error");
      }
      const ping = setInterval(() => send(String(Date.now()), "ping"), 20_000);
      // Ferme proprement avant la limite d'exécution ; EventSource se reconnecte seul.
      const stop = setTimeout(() => { cleanup(); try { controller.close(); } catch {} }, 55_000);
      cleanup = () => { clearInterval(ping); clearTimeout(stop); unsub(); };
      req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
