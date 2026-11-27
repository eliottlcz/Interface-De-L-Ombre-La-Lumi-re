"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, PenLine, Upload, AlertTriangle, CheckCircle2, PlugZap, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Segmented, Select, Tabs, Textarea, useAction, cx } from "@/components/ui";
import { LinesChart, RankBars } from "@/components/charts";
import { deleteManualMetric, importManualSeries, saveManualMetrics, syncNow } from "@/actions/stats";
import { compact, formatDate, formatDateTime, timeAgo, todayISO } from "@/lib/dates";
import type { PlatformKey } from "@/lib/labels";

type Metric = { key: string; label: string; api: boolean; baseDay: string | null; latest: { value: number; day: string; source: "api" | "manuel" } | null; delta: number | null; series: { day: string; value: number; source: string }[]; manual: { day: string; value: number }[] };
export type PlatformData = {
  key: PlatformKey; label: string;
  connector: { configured: boolean; connected: boolean; account: string | null; lastSync: string | null; lastError: string | null; envVars: string[]; docs: string } | null;
  lastRun: { status: string; message: string | null; at: string } | null;
  metrics: Metric[];
  contents: { id: string; kind: string; title: string | null; url: string | null; publishedAt: string | null; metrics: Record<string, number> }[];
};
const KIND = { video: "Vidéos longues", short: "Shorts", reel: "Reels", post: "Publications", tiktok: "Vidéos" } as Record<string, string>;
const MLABEL: Record<string, string> = { vues: "Vues", likes: "Likes", commentaires: "Commentaires", partages: "Partages", portee: "Portée" };

export function StatsView({ platforms, period, from, to, canEnter, canConnect }: { platforms: PlatformData[]; period: string; from: string; to: string; canEnter: boolean; canConnect: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [tab, setTab] = useState<string>("ensemble");
  const [entry, setEntry] = useState<PlatformData | null>(null);
  const [importing, setImporting] = useState<PlatformData | null>(null);
  const [custom, setCustom] = useState({ du: from, au: to });
  const { pending, exec } = useAction();
  const setPeriod = (p: string, extra: Record<string, string> = {}) => { const q = new URLSearchParams(sp.toString()); q.set("periode", p); q.delete("du"); q.delete("au"); for (const [k, v] of Object.entries(extra)) q.set(k, v); router.replace(`${pathname}?${q}`, { scroll: false }); };
  const metricOf = (p: PlatformData, k: string) => p.metrics.find((m) => m.key === k);
  const followers = platforms.map((p) => ({ label: p.label, value: metricOf(p, "abonnes")?.latest?.value ?? null, hint: metricOf(p, "abonnes")?.latest?.source === "manuel" ? "saisie manuelle" : undefined })).filter((x) => x.value !== null) as { label: string; value: number; hint?: string }[];
  const audience = platforms.map((p) => { const m = metricOf(p, "vues") ?? metricOf(p, "streams") ?? metricOf(p, "ecoutes"); return { label: `${p.label} — ${m?.label ?? ""}`, value: m?.latest?.value ?? null, hint: m?.latest?.source === "manuel" ? "saisie manuelle" : undefined }; }).filter((x) => x.value !== null) as { label: string; value: number; hint?: string }[];
  const current = platforms.find((p) => p.key === tab);

  return (
    <div>
      <PageHeader eyebrow="Statistiques" title="L'audience en pleine lumière"
        description="YouTube, Instagram, TikTok et plateformes de podcast. Chaque chiffre indique sa source (API ou saisie manuelle) et sa date ; rien n'est jamais estimé ni inventé." />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented value={period} onChange={(v) => (v === "perso" ? setPeriod("perso", custom) : setPeriod(v))} items={[{ value: "7j", label: "7 j" }, { value: "30j", label: "30 j" }, { value: "90j", label: "90 j" }, { value: "12m", label: "12 mois" }, { value: "perso", label: "Période" }]} />
        {period === "perso" && <span className="flex flex-wrap items-center gap-1 text-xs text-muted">du <Input type="date" value={custom.du} onChange={(e) => setCustom({ ...custom, du: e.target.value })} className="h-9 w-[150px]" aria-label="Du" /> au <Input type="date" value={custom.au} onChange={(e) => setCustom({ ...custom, au: e.target.value })} className="h-9 w-[150px]" aria-label="Au" /><Button size="sm" onClick={() => setPeriod("perso", custom)}>Appliquer</Button></span>}
        <span className="text-xs text-muted">{formatDate(from)} → {formatDate(to)}</span>
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-6" items={[{ value: "ensemble", label: "Vue d'ensemble" }, ...platforms.map((p) => ({ value: p.key, label: p.label }))]} />

      {tab === "ensemble" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {platforms.map((p) => <PlatformStatus key={p.key} p={p} canEnter={canEnter} canConnect={canConnect} onOpen={() => setTab(p.key)} onEntry={() => setEntry(p)} onSync={() => exec(() => syncNow(p.key))} syncing={pending} />)}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="p-5"><RankBars title="Comparaison des communautés (abonnés)" rows={followers} format={(n) => compact(n)} empty="Aucune donnée d'abonnés : connectez une plateforme ou saisissez une valeur." /></Card>
            <Card className="p-5"><RankBars title="Comparaison de l'audience (vues / streams / écoutes)" rows={audience} format={(n) => compact(n)} empty="Aucune donnée d'audience disponible." /></Card>
          </div>
        </div>
      )}

      {current && (
        <div className="flex flex-col gap-6">
          <PlatformStatus p={current} canEnter={canEnter} canConnect={canConnect} onEntry={() => setEntry(current)} onImport={() => setImporting(current)} onSync={() => exec(() => syncNow(current.key))} syncing={pending} wide />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {current.metrics.map((m) => (
              <Card key={m.key} className="p-4">
                <div className="text-[11px] text-muted">{m.label}</div>
                <div className="display mt-2 text-2xl">{m.latest ? compact(m.latest.value) : "—"}</div>
                {m.latest ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <Badge tone={m.latest.source === "api" ? "ok" : "olive"}>{m.latest.source === "api" ? "API" : "Saisie manuelle"}</Badge>{formatDate(m.latest.day, { day: "numeric", month: "short" })}
                    {m.delta !== null && <span className={m.delta >= 0 ? "text-gold" : "text-alert"}>{m.delta >= 0 ? "+" : ""}{compact(m.delta)} depuis le {formatDate(m.baseDay!, { day: "numeric", month: "short" })}</span>}
                  </div>
                ) : <div className="mt-1 text-[11px] text-muted">{m.api ? (current.connector?.connected ? "Pas encore synchronisé" : "Donnée indisponible — compte non connecté") : "Non fourni par l'API — saisie manuelle"}</div>}
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {current.metrics.filter((m) => m.series.length >= 1).slice(0, 4).map((m) => (
              <Card key={m.key} className="p-5">
                <LinesChart title={`Évolution — ${m.label}`} subtitle={m.series.some((x) => x.source === "manuel") ? "Inclut des saisies manuelles" : "Source : API"} data={m.series.map((x) => ({ jour: formatDate(x.day, { day: "numeric", month: "short" }), valeur: x.value }))} xKey="jour" series={[{ key: "valeur", label: m.label }]} format={(n) => compact(n)} />
              </Card>
            ))}
            {current.metrics.every((m) => m.series.length === 0) && <Card className="p-6 text-sm text-muted xl:col-span-2">Aucune donnée sur la période sélectionnée. {current.connector?.connected ? "Lancez une synchronisation." : canEnter ? "Connectez le compte ou saisissez des valeurs manuellement." : ""}</Card>}
          </div>
          <ContentRanking key={current.key} p={current} from={from} to={to} />
          {canEnter && current.metrics.some((m) => m.manual.length) && (
            <Card className="p-5">
              <div className="mb-3 text-sm font-semibold">Saisies manuelles de la période</div>
              <ul className="flex flex-col">
                {current.metrics.flatMap((m) => m.manual.map((x) => ({ ...x, m }))).sort((a, b) => b.day.localeCompare(a.day)).map((x) => (
                  <li key={x.m.key + x.day} className="flex items-center gap-3 border-b border-line/60 py-2 text-sm last:border-0"><span className="w-24 text-muted">{formatDate(x.day)}</span><span className="flex-1">{x.m.label}</span><span className="tabular-nums">{x.value.toLocaleString("fr-FR")}</span>
                    <button onClick={() => exec(() => deleteManualMetric(current.key, x.m.key, x.day))} className="text-muted hover:text-alert" aria-label="Supprimer"><Trash2 className="size-4" /></button></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Modal open={entry !== null} onClose={() => setEntry(null)} title={`Saisie manuelle — ${entry?.label ?? ""}`}>
        {entry && <ManualForm p={entry} onDone={() => setEntry(null)} />}
      </Modal>
      <Modal open={importing !== null} onClose={() => setImporting(null)} title={`Importer une série — ${importing?.label ?? ""}`}>
        {importing && <ImportForm p={importing} onDone={() => setImporting(null)} />}
      </Modal>
    </div>
  );
}

function PlatformStatus({ p, canEnter, canConnect, onOpen, onEntry, onImport, onSync, syncing, wide }: { p: PlatformData; canEnter: boolean; canConnect: boolean; onOpen?: () => void; onEntry: () => void; onImport?: () => void; onSync: () => void; syncing: boolean; wide?: boolean }) {
  const c = p.connector;
  const followers = p.metrics.find((m) => m.key === "abonnes")?.latest;
  const state = !c ? { label: "Saisie manuelle", tone: "olive" as const, text: "Pas d'API publique de statistiques : données saisies ou importées depuis vos exports." }
    : !c.configured ? { label: "Non configuré", tone: "muted" as const, text: `Identifiants d'application manquants : ${c.envVars.join(", ")}.` }
    : !c.connected ? { label: "Non connecté", tone: "muted" as const, text: "Application configurée, compte à autoriser." }
    : c.lastError ? { label: "Erreur", tone: "alert" as const, text: c.lastError }
    : { label: "Connecté", tone: "ok" as const, text: c.account ?? "" };
  return (
    <Card className={cx("flex flex-col p-5", wide && "md:flex-row md:items-center md:gap-6")}>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button onClick={onOpen} className="text-lg font-semibold hover:text-gold" disabled={!onOpen}>{p.label}</button>
          <Badge tone={state.tone}>{state.tone === "ok" ? <CheckCircle2 className="size-3" /> : state.tone === "alert" ? <AlertTriangle className="size-3" /> : null}{state.label}</Badge>
        </div>
        <p className={cx("text-xs", state.tone === "alert" ? "text-alert" : "text-muted")}>{state.text}</p>
        {c?.lastSync && <p className="mt-1 text-xs text-muted" title={formatDateTime(c.lastSync)}>Dernière synchronisation : {timeAgo(c.lastSync)}</p>}
        {c && !c.lastSync && c.connected && <p className="mt-1 text-xs text-muted">Jamais synchronisé.</p>}
        {!wide && <div className="display mt-4 text-3xl">{followers ? compact(followers.value) : "—"}<span className="ml-2 font-sans text-xs font-normal normal-case text-muted">abonnés{followers?.source === "manuel" ? " · saisie manuelle" : ""}</span></div>}
        {wide && c && !c.configured && <p className="mt-2 text-xs text-muted">{c.docs}</p>}
      </div>
      <div className={cx("mt-4 flex flex-wrap gap-2", wide && "md:mt-0")}>
        {c?.configured && c.connected && <Button size="sm" loading={syncing} onClick={onSync}><RefreshCw className="size-3.5" />Synchroniser</Button>}
        {c?.configured && !c.connected && canConnect && <a href={`/api/integrations/connect/${p.key}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gold px-3 text-xs font-semibold text-black"><PlugZap className="size-3.5" />Connecter</a>}
        {canEnter && <Button size="sm" variant="ghost" onClick={onEntry}><PenLine className="size-3.5" />Saisir</Button>}
        {canEnter && onImport && <Button size="sm" variant="ghost" onClick={onImport}><Upload className="size-3.5" />Importer</Button>}
      </div>
    </Card>
  );
}

function ContentRanking({ p, from, to }: { p: PlatformData; from: string; to: string }) {
  const kinds = [...new Set(p.contents.map((c) => c.kind))];
  const [kind, setKind] = useState(kinds[0] ?? "");
  const [metric, setMetric] = useState("vues");
  const inPeriod = p.contents.filter((c) => (!kind || c.kind === kind) && (!c.publishedAt || (c.publishedAt.slice(0, 10) >= from && c.publishedAt.slice(0, 10) <= to)));
  const all = p.contents.filter((c) => !kind || c.kind === kind);
  const [scope, setScope] = useState<"periode" | "tout">("tout");
  const rows = (scope === "periode" ? inPeriod : all).filter((c) => typeof c.metrics[metric] === "number").sort((a, b) => b.metrics[metric] - a.metrics[metric]).slice(0, 10)
    .map((c) => ({ label: c.title || "(sans titre)", value: c.metrics[metric], href: c.url ?? undefined, hint: c.publishedAt ? formatDate(c.publishedAt) : undefined }));
  if (!p.contents.length) return p.connector ? <Card className="p-5 text-sm text-muted">Classement des contenus : disponible après la première synchronisation du compte {p.label}.</Card> : null;
  const metricKeys = [...new Set(p.contents.flatMap((c) => Object.keys(c.metrics)))];
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Classement des contenus</span>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 w-auto text-xs" aria-label="Type">{kinds.map((k) => <option key={k} value={k}>{KIND[k] ?? k}</option>)}</Select>
        <Select value={metric} onChange={(e) => setMetric(e.target.value)} className="h-8 w-auto text-xs" aria-label="Indicateur">{metricKeys.map((k) => <option key={k} value={k}>{MLABEL[k] ?? k}</option>)}</Select>
        <Segmented value={scope} onChange={setScope} items={[{ value: "tout", label: "Tous" }, { value: "periode", label: "Publiés sur la période" }]} />
      </div>
      <RankBars title="" rows={rows} format={(n) => compact(n)} empty="Aucun contenu pour ces critères." />
      <p className="mt-3 text-[11px] text-muted">Valeurs relevées lors de la dernière synchronisation (API {p.label}).</p>
    </Card>
  );
}

function ManualForm({ p, onDone }: { p: PlatformData; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [day, setDay] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); exec(() => saveManualMetrics({ platform: p.key, day, values, note }), { onSuccess: onDone }); }}>
      <p className="text-sm text-soft">Ces valeurs seront toujours affichées avec la mention « Saisie manuelle ». Si l&apos;API fournit une valeur pour le même jour, c&apos;est elle qui prime.</p>
      <Field label="Date de la mesure"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} max={todayISO()} required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {p.metrics.map((m) => <Field key={m.key} label={m.label}><Input inputMode="decimal" value={values[m.key] ?? ""} onChange={(e) => setValues({ ...values, [m.key]: e.target.value })} placeholder={m.latest ? `Dernière : ${m.latest.value.toLocaleString("fr-FR")}` : ""} /></Field>)}
      </div>
      <Field label="Source / remarque"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : relevé dans Spotify for Creators" /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Enregistrer</Button></div>
    </form>
  );
}
function ImportForm({ p, onDone }: { p: PlatformData; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [metric, setMetric] = useState(p.metrics[0]?.key ?? "");
  const [text, setText] = useState("");
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); exec(() => importManualSeries({ platform: p.key, metric, text }), { onSuccess: onDone }); }}>
      <p className="text-sm text-soft">Collez les colonnes « date » et « valeur » d&apos;un export (Spotify for Creators, Apple Podcasts Connect…), une ligne par date. Formats acceptés : 2026-11-20;1250 ou 20/11/2026;1250. Les lignes d&apos;en-tête sont ignorées.</p>
      <Field label="Indicateur"><Select value={metric} onChange={(e) => setMetric(e.target.value)}>{p.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></Field>
      <Field label="Données"><Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"2026-11-01;120\n2026-11-02;134"} className="font-mono text-sm" /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending} disabled={!text.trim()}>Importer</Button></div>
    </form>
  );
}
