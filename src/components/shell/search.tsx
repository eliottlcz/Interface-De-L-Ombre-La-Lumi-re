"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ExternalLink as Ext } from "lucide-react";
import { searchAll, type SearchGroup } from "@/actions/search";

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => { if (open) { setTimeout(() => input.current?.focus(), 10); } else { setQ(""); setGroups([]); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setGroups([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { setGroups(await searchAll(q)); setCursor(0); } finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const flat = groups.flatMap((g) => g.hits);
  const go = (i: number) => {
    const h = flat[i]; if (!h) return;
    onClose();
    if (h.external) window.open(h.href, "_blank", "noopener"); else router.push(h.href);
  };
  if (!open) return null;
  let idx = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-0 backdrop-blur-sm md:p-4 md:pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="animate-in flex h-full w-full flex-col overflow-hidden border border-line bg-panel shadow-2xl md:h-auto md:max-h-[70vh] md:max-w-2xl md:rounded-2xl pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 text-gold" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invités, épisodes, tâches, documents, dépenses, idées…"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === "Enter") go(cursor);
            }}
            className="h-14 flex-1 bg-transparent text-[16px] text-cream placeholder:text-muted focus:outline-none" />
          <button onClick={onClose} className="text-sm text-muted md:hidden">Fermer</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {q.trim().length < 2 && <p className="px-5 py-6 text-sm text-muted">Tapez au moins deux caractères.</p>}
          {q.trim().length >= 2 && !loading && groups.length === 0 && <p className="px-5 py-6 text-sm text-muted">Aucun résultat pour « {q} ».</p>}
          {groups.map((g) => (
            <div key={g.key} className="mb-2">
              <div className="eyebrow px-5 py-2">{g.label}</div>
              {g.hits.map((h) => {
                idx++; const i = idx;
                return (
                  <button key={g.key + h.id} onMouseEnter={() => setCursor(i)} onClick={() => go(i)}
                    className={`flex w-full items-center gap-3 px-5 py-2.5 text-left ${cursor === i ? "bg-panel-2" : ""}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{h.title}</span>
                      {h.subtitle && <span className="block truncate text-xs text-muted">{h.subtitle}</span>}
                    </span>
                    {h.external && <Ext className="size-4 text-muted" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
