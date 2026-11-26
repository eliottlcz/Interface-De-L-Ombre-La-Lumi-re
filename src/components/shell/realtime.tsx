"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "connecte" | "connexion" | "secours";
const Ctx = createContext<Status>("connexion");
export const useSyncStatus = () => useContext(Ctx);

/**
 * Synchronisation entre appareils :
 *  1. flux temps réel (SSE) → rafraîchit les données ~instantanément après toute modification ;
 *  2. retour sur l'onglet / l'app → rafraîchissement immédiat ;
 *  3. secours : si le flux est indisponible, rafraîchissement toutes les 30 s.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connexion");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 350);
    };
    let es: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    const startFallback = () => { if (!fallback) fallback = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30_000); };
    const stopFallback = () => { if (fallback) { clearInterval(fallback); fallback = null; } };
    const connect = () => {
      es?.close();
      es = new EventSource("/api/realtime");
      es.addEventListener("ready", () => { setStatus("connecte"); stopFallback(); });
      es.addEventListener("change", refresh);
      es.addEventListener("error", () => { setStatus("secours"); startFallback(); });
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        if (!es || es.readyState === EventSource.CLOSED) connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => { es?.close(); stopFallback(); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [router]);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}

export function SyncDot() {
  const s = useSyncStatus();
  const label = s === "connecte" ? "Synchronisé en temps réel" : s === "connexion" ? "Connexion…" : "Synchronisation de secours (30 s)";
  return (
    <span title={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className={`size-2 rounded-full ${s === "connecte" ? "bg-ok" : s === "connexion" ? "bg-muted animate-pulse" : "bg-gold"}`} />
      <span className="hidden xl:inline">{s === "connecte" ? "En direct" : s === "connexion" ? "Connexion" : "Secours"}</span>
    </span>
  );
}
