"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Status = "connecte" | "connexion" | "secours";
const Ctx = createContext<Status>("connexion");
export const useSyncStatus = () => useContext(Ctx);

const POLL_MS = 4000;

/**
 * Synchronisation entre appareils, sans connexion permanente :
 *  - toutes les 4 s (onglet visible), l'appareil lit un compteur de modifications ; s'il a changé, les données sont rafraîchies ;
 *  - au retour sur l'onglet, à la reconnexion du réseau et au démarrage : vérification immédiate ;
 *  - si le serveur ne répond pas, l'indicateur passe en « liaison de secours » et la vérification continue.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("connexion");
  const last = useRef<string | null>(null);
  const navAt = useRef(Date.now()); // instant du dernier changement de page : pas de rafraîchissement forcé pendant le chargement
  useEffect(() => { navAt.current = Date.now(); }, [pathname]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let t1: ReturnType<typeof setTimeout> | null = null;
    let t2: ReturnType<typeof setTimeout> | null = null;

    // Rafraîchissement rapide, puis un second de rattrapage (une lecture lancée avant la fin des écritures de l'auteur pourrait être périmée)
    const refresh = () => {
      if (t1) clearTimeout(t1); if (t2) clearTimeout(t2);
      const go = () => { const wait = 3000 - (Date.now() - navAt.current); if (wait > 0) setTimeout(() => router.refresh(), wait); else router.refresh(); };
      t1 = setTimeout(go, 250);
      t2 = setTimeout(go, 1800);
    };

    const poll = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const c = new AbortController();
        const to = setTimeout(() => c.abort(), 8000);
        const r = await fetch("/api/sync", { cache: "no-store", credentials: "same-origin", signal: c.signal });
        clearTimeout(to);
        if (r.status === 401) { setStatus("secours"); router.refresh(); return; } // session expirée : la page redirigera vers la connexion
        if (!r.ok) throw new Error(String(r.status));
        const { v } = (await r.json()) as { v: string };
        setStatus("connecte");
        if (last.current !== null && v !== last.current) refresh();
        last.current = v;
      } catch { setStatus("secours"); }
      finally { busy = false; }
    };

    const loop = () => {
      if (stopped) return;
      if (document.visibilityState === "visible") void poll();
      timer = setTimeout(loop, POLL_MS);
    };
    const now = () => { if (timer) clearTimeout(timer); loop(); };
    const onVisible = () => { if (document.visibilityState === "visible") { router.refresh(); now(); } };

    now();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", now);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer); if (t1) clearTimeout(t1); if (t2) clearTimeout(t2);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", now);
    };
  }, [router]);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}

export function SyncDot() {
  const s = useSyncStatus();
  const label = s === "connecte" ? "À l’antenne : synchronisé avec les autres appareils" : s === "connexion" ? "Réglage du signal…" : "Liaison de secours : nouvelle tentative en cours";
  return (
    <span title={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className={`size-2 rounded-full ${s === "connecte" ? "bg-ok" : s === "connexion" ? "bg-muted animate-pulse" : "bg-gold"}`} />
      <span className="hidden xl:inline">{s === "connecte" ? "À l’antenne" : s === "connexion" ? "Réglage…" : "Liaison de secours"}</span>
    </span>
  );
}
