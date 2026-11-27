import { desc, gte, inArray } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { addDaysISO, todayISO } from "@/lib/dates";
import { PLATFORM_METRICS, PLATFORMS, type PlatformKey } from "@/lib/labels";
import { CONNECTORS } from "@/lib/integrations/connectors";
import { StatsView, type PlatformData } from "./stats-view";

export const metadata = { title: "Statistiques" };
const PERIODS: Record<string, number> = { "7j": 7, "30j": 30, "90j": 90, "12m": 365 };

export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("stats.voir");
  const sp = await searchParams;
  const today = todayISO();
  const period = sp.periode && (PERIODS[sp.periode] || sp.periode === "perso") ? sp.periode : "30j";
  const from = period === "perso" && /^\d{4}-\d{2}-\d{2}$/.test(sp.du ?? "") ? sp.du! : addDaysISO(today, -(PERIODS[period] ?? 30));
  const to = period === "perso" && /^\d{4}-\d{2}-\d{2}$/.test(sp.au ?? "") ? sp.au! : today;
  const [snaps, integ, runs, cstats] = await Promise.all([
    db.select().from(s.metricSnapshots).where(gte(s.metricSnapshots.day, addDaysISO(from, -400))).orderBy(s.metricSnapshots.day),
    db.select().from(s.integrations).where(inArray(s.integrations.provider, ["youtube", "instagram", "tiktok"])),
    db.select().from(s.syncRuns).orderBy(desc(s.syncRuns.startedAt)).limit(30),
    db.select().from(s.contentStats).orderBy(desc(s.contentStats.publishedAt)).limit(500),
  ]);
  const platforms: PlatformData[] = (Object.keys(PLATFORMS) as PlatformKey[]).map((p) => {
    const conn = p in CONNECTORS ? CONNECTORS[p as keyof typeof CONNECTORS] : null;
    const row = integ.find((i) => i.provider === p);
    const mine = snaps.filter((x) => x.platform === p);
    const metrics = PLATFORM_METRICS[p].map((m) => {
      const all = mine.filter((x) => x.metric === m.key);
      // une valeur par jour, l'API prime sur la saisie manuelle
      const byDay = new Map<string, (typeof all)[number]>();
      for (const x of all) if (!byDay.has(x.day) || x.source === "api") byDay.set(x.day, x);
      const ordered = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
      const upTo = ordered.filter((x) => x.day <= to);
      const latest = upTo[upTo.length - 1] ?? null;
      const base = [...ordered].reverse().find((x) => x.day <= from) ?? null;
      return {
        key: m.key, label: m.label, api: m.api && Boolean(conn),
        latest: latest ? { value: latest.value, day: latest.day, source: latest.source } : null,
        delta: latest && base && base.day < latest.day ? latest.value - base.value : null,
        baseDay: latest && base && base.day < latest.day ? base.day : null,
        series: ordered.filter((x) => x.day >= from && x.day <= to).map((x) => ({ day: x.day, value: x.value, source: x.source })),
        manual: all.filter((x) => x.source === "manuel" && x.day >= from && x.day <= to).map((x) => ({ day: x.day, value: x.value })),
      };
    });
    return {
      key: p, label: PLATFORMS[p],
      connector: conn ? { configured: conn.isConfigured(), connected: Boolean(row?.accessTokenEnc), account: row?.accountLabel ?? null, lastSync: row?.lastSyncAt?.toISOString() ?? null, lastError: row?.lastError ?? null, envVars: conn.envVars, docs: conn.docs } : null,
      lastRun: runs.find((r) => r.provider === p) ? { status: runs.find((r) => r.provider === p)!.status, message: runs.find((r) => r.provider === p)!.message, at: runs.find((r) => r.provider === p)!.startedAt.toISOString() } : null,
      metrics,
      contents: cstats.filter((c) => c.platform === p).map((c) => ({ id: c.id, kind: c.kind, title: c.title, url: c.url, publishedAt: c.publishedAt?.toISOString() ?? null, metrics: c.metrics })),
    };
  });
  return <StatsView platforms={platforms} period={period} from={from} to={to} canEnter={can(user, "stats.saisir")} canConnect={can(user, "integrations.gerer")} />;
}
