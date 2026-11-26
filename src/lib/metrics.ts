import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { PLATFORMS, type PlatformKey } from "@/lib/labels";

export type Latest = { value: number; day: string; source: "api" | "manuel" } | null;

/** Dernière valeur connue d'un indicateur (l'API prime sur la saisie manuelle le même jour). */
export async function latestMetric(platform: string, metric: string): Promise<Latest> {
  const [r] = await db.select().from(s.metricSnapshots).where(and(eq(s.metricSnapshots.platform, platform), eq(s.metricSnapshots.metric, metric)))
    .orderBy(desc(s.metricSnapshots.day), asc(s.metricSnapshots.source)).limit(1);
  return r ? { value: r.value, day: r.day, source: r.source } : null;
}

/** Valeur à une date donnée ou juste avant (pour calculer une évolution). */
export async function metricAtOrBefore(platform: string, metric: string, day: string): Promise<number | null> {
  const [r] = await db.select({ v: s.metricSnapshots.value }).from(s.metricSnapshots)
    .where(and(eq(s.metricSnapshots.platform, platform), eq(s.metricSnapshots.metric, metric), sql`${s.metricSnapshots.day} <= ${day}`))
    .orderBy(desc(s.metricSnapshots.day), asc(s.metricSnapshots.source)).limit(1);
  return r?.v ?? null;
}

export async function series(platform: string, metric: string, fromDay: string) {
  const rows = await db.select({ day: s.metricSnapshots.day, value: s.metricSnapshots.value, source: s.metricSnapshots.source }).from(s.metricSnapshots)
    .where(and(eq(s.metricSnapshots.platform, platform), eq(s.metricSnapshots.metric, metric), gte(s.metricSnapshots.day, fromDay)))
    .orderBy(asc(s.metricSnapshots.day), asc(s.metricSnapshots.source));
  const byDay = new Map<string, { day: string; value: number; source: string }>();
  for (const r of rows) if (!byDay.has(r.day)) byDay.set(r.day, r); // api avant manuel
  return [...byDay.values()];
}

/** Somme d'un indicateur sur toutes les plateformes qui en disposent, avec le détail. */
export async function crossPlatform(metric: string, platforms = Object.keys(PLATFORMS) as PlatformKey[]) {
  const parts = (await Promise.all(platforms.map(async (p) => ({ platform: p, latest: await latestMetric(p, metric) })))).filter((x) => x.latest);
  return { total: parts.length ? parts.reduce((a, x) => a + x.latest!.value, 0) : null, parts };
}

/** Indicateurs internes, calculés à partir des données du QG (toujours exacts). */
export async function internalCounts() {
  const [r] = await db.select({
    invitesRecus: sql<number>`(select count(*)::int from contacts where category = 'invite_recu' and archived_at is null)`,
    contactes: sql<number>`(select count(*)::int from contacts where last_contact_at is not null or category in ('mail_envoye','a_relancer','invite_recu'))`,
    episodesDisponibles: sql<number>`(select count(*)::int from episodes where published_at is not null)`,
    enProduction: sql<number>`(select count(*)::int from episodes where published_at is null and archived_at is null and stage not in ('identifie','premier_contact','interesse'))`,
    contenusPublies: sql<number>`(select count(*)::int from contents where status = 'publie' and kind in ('youtube_complet','short','reel','tiktok','teaser'))`,
  }).from(sql`(select 1) x`);
  return r;
}
