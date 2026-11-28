"use client";
/**
 * Graphiques du QG — palette dérivée de la charte, validée (fond sombre #12110d) :
 *   série 1 = or #B39A42 · série 2 = cuivre #9F4F2E (contrôle daltonisme, contraste : OK).
 * Une série unique utilise l'or. Un seul axe par graphique, traits fins, info-bulle au survol,
 * légende dès deux séries, et une vue tableau pour chaque graphique.
 */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3 } from "lucide-react";

export const SERIES = ["#B39A42", "#9F4F2E"] as const;
const GRID = "#2a2720";
const AXIS = "#8f8a80";

type Point = Record<string, string | number | null>;
type Series = { key: string; label: string };

function Frame({ title, subtitle, data, series, xKey, format, children, empty }: { title: string; subtitle?: string; data: Point[]; series: Series[]; xKey: string; format: (n: number) => string; children: React.ReactNode; empty?: string }) {
  const [table, setTable] = useState(false);
  const hasData = data.some((d) => series.some((s) => typeof d[s.key] === "number"));
  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3">
          {series.length > 1 && (
            <ul className="flex flex-wrap gap-3 text-xs text-soft" aria-label="Légende">
              {series.map((s, i) => <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES[i] }} />{s.label}</li>)}
            </ul>
          )}
          {hasData && <button onClick={() => setTable(!table)} className="text-muted hover:text-gold" aria-label={table ? "Afficher le graphique" : "Afficher le tableau"} title={table ? "Graphique" : "Tableau"}>
            {table ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}</button>}
        </div>
      </figcaption>
      {!hasData ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-muted">{empty ?? "Pas encore de données."}</div>
      ) : table ? (
        <div className="max-h-64 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left text-xs text-muted"><tr><th className="px-3 py-2">—</th>{series.map((s) => <th key={s.key} className="px-3 py-2 text-right">{s.label}</th>)}</tr></thead>
            <tbody>{data.map((d, i) => <tr key={i} className="border-t border-line/60"><td className="px-3 py-1.5">{String(d[xKey])}</td>{series.map((s) => <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">{typeof d[s.key] === "number" ? format(d[s.key] as number) : "—"}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <div className="h-56 w-full">{children}</div>}
    </figure>
  );
}

function Tip({ active, payload, label, format, series }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; format: (n: number) => string; series: Series[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-panel-2 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-muted">{label}</div>
      {payload.map((p) => {
        const i = series.findIndex((s) => s.key === p.dataKey);
        return <div key={p.dataKey} className="flex items-center gap-2 text-cream"><span className="size-2 rounded-sm" style={{ background: SERIES[i] ?? SERIES[0] }} />{series[i]?.label} <span className="ml-auto pl-3 font-semibold tabular-nums">{format(p.value)}</span></div>;
      })}
    </div>
  );
}

const axisProps = { stroke: AXIS, tick: { fill: AXIS, fontSize: 11 }, tickLine: false, axisLine: false } as const;

export function BarsChart({ title, subtitle, data, xKey, series, format = (n) => n.toLocaleString("fr-FR"), empty }: { title: string; subtitle?: string; data: Point[]; xKey: string; series: Series[]; format?: (n: number) => string; empty?: string }) {
  return (
    <Frame title={title} subtitle={subtitle} data={data} series={series} xKey={xKey} format={format} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={72} tickFormatter={(v) => format(v)} />
          <Tooltip cursor={{ fill: "rgba(223,198,98,0.06)" }} content={<Tip format={format} series={series} />} />
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function LinesChart({ title, subtitle, data, xKey, series, format = (n) => n.toLocaleString("fr-FR"), empty }: { title: string; subtitle?: string; data: Point[]; xKey: string; series: Series[]; format?: (n: number) => string; empty?: string }) {
  return (
    <Frame title={title} subtitle={subtitle} data={data} series={series} xKey={xKey} format={format} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} {...axisProps} minTickGap={40} tickFormatter={(v, i) => (i > 0 && String((data[i - 1] as Record<string, unknown>)?.[xKey]) === String(v) ? "" : String(v))} />
          <YAxis {...axisProps} width={72} tickFormatter={(v) => format(v)} domain={["auto", "auto"]} />
          <Tooltip cursor={{ stroke: "#3a362b" }} content={<Tip format={format} series={series} />} />
          {series.map((s, i) => <Line key={s.key} dataKey={s.key} stroke={SERIES[i]} strokeWidth={2} dot={data.length < 20 ? { r: 3, fill: SERIES[i], strokeWidth: 2, stroke: "#12110d" } : false} activeDot={{ r: 5, stroke: "#12110d", strokeWidth: 2 }} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/** Classement horizontal (HTML) — une seule couleur, libellés et valeurs en texte. */
export function RankBars({ title, rows, format = (n) => n.toLocaleString("fr-FR"), empty }: { title: string; rows: { label: string; value: number; href?: string; hint?: string }[]; format?: (n: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm font-semibold">{title}</figcaption>
      {rows.length === 0 ? <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{empty ?? "Pas encore de données."}</div> : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.label} title={`${r.label} : ${format(r.value)}`}>
              <div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate text-soft">{r.href ? <a href={r.href} target={r.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="hover:text-gold">{r.label}</a> : r.label}{r.hint && <span className="text-muted"> · {r.hint}</span>}</span><span className="tabular-nums text-cream">{format(r.value)}</span></div>
              <div className="h-1.5 rounded-full bg-line"><div className="h-full rounded-full" style={{ width: `${(100 * r.value) / max}%`, background: SERIES[0] }} /></div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
