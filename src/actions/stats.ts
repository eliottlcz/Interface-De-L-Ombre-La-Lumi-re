"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { PLATFORM_METRICS, PLATFORMS, type PlatformKey } from "@/lib/labels";
import { CONNECTORS, isConnectorId, runSync } from "@/lib/integrations/connectors";
import { disconnect } from "@/lib/integrations/store";

const platformKey = z.enum(Object.keys(PLATFORMS) as [PlatformKey, ...PlatformKey[]]);
function checkMetric(platform: PlatformKey, metric: string) {
  if (!PLATFORM_METRICS[platform].some((m) => m.key === metric)) userError("Indicateur inconnu pour cette plateforme.");
}

/** Saisie manuelle — enregistrée avec la source « manuel », toujours identifiée comme telle. */
export async function saveManualMetrics(input: { platform: string; day: string; values: Record<string, string>; note?: string }) {
  return run(async () => {
    const u = await assertPermission("stats.saisir");
    const platform = platformKey.parse(input.platform);
    const day = z.iso.date().parse(input.day);
    let n = 0;
    for (const [metric, raw] of Object.entries(input.values)) {
      if (raw === "" || raw === undefined) continue;
      checkMetric(platform, metric);
      const value = Number(String(raw).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(value) || value < 0) userError(`Valeur invalide pour « ${metric} ».`);
      await db.insert(s.metricSnapshots).values({ platform, metric, day, value, source: "manuel", note: input.note || null, enteredBy: u.id })
        .onConflictDoUpdate({ target: [s.metricSnapshots.platform, s.metricSnapshots.metric, s.metricSnapshots.day, s.metricSnapshots.source], set: { value, enteredBy: u.id, note: input.note || null, createdAt: new Date() } });
      n++;
    }
    if (!n) userError("Aucune valeur saisie.");
    await audit({ userId: u.id, action: "stats.saisie", summary: `${n} indicateur(s) ${PLATFORMS[platform]} saisi(s) pour le ${day}` });
    return { ok: true as const, message: `${n} valeur(s) enregistrée(s) (saisie manuelle)` };
  });
}

/** Import collé depuis un export CSV (Spotify for Creators, Apple Podcasts…) : lignes « AAAA-MM-JJ;valeur ». */
export async function importManualSeries(input: { platform: string; metric: string; text: string }) {
  return run(async () => {
    const u = await assertPermission("stats.saisir");
    const platform = platformKey.parse(input.platform);
    checkMetric(platform, input.metric);
    const lines = input.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let n = 0; const bad: string[] = [];
    for (const l of lines) {
      const [d, v] = l.split(/[;,\t]/).map((x) => x?.trim());
      const day = /^\d{2}\/\d{2}\/\d{4}$/.test(d ?? "") ? `${d!.slice(6)}-${d!.slice(3, 5)}-${d!.slice(0, 2)}` : d;
      const value = Number((v ?? "").replace(/\s/g, "").replace(",", "."));
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value)) { if (!/^[a-zA-Z]/.test(l)) bad.push(l); continue; }
      await db.insert(s.metricSnapshots).values({ platform, metric: input.metric, day, value, source: "manuel", note: "Import collé", enteredBy: u.id })
        .onConflictDoUpdate({ target: [s.metricSnapshots.platform, s.metricSnapshots.metric, s.metricSnapshots.day, s.metricSnapshots.source], set: { value, enteredBy: u.id, createdAt: new Date() } });
      n++;
    }
    if (!n) userError("Aucune ligne valide. Format attendu : AAAA-MM-JJ;valeur (ou JJ/MM/AAAA;valeur), une ligne par date.");
    await audit({ userId: u.id, action: "stats.import", summary: `${n} valeur(s) importée(s) — ${PLATFORMS[platform]} / ${input.metric}` });
    return { ok: true as const, message: `${n} ligne(s) importée(s)${bad.length ? `, ${bad.length} ignorée(s)` : ""}` };
  });
}

export async function deleteManualMetric(platform: string, metric: string, day: string) {
  return run(async () => {
    const u = await assertPermission("stats.saisir");
    await db.delete(s.metricSnapshots).where(and(eq(s.metricSnapshots.platform, platform), eq(s.metricSnapshots.metric, metric), eq(s.metricSnapshots.day, day), eq(s.metricSnapshots.source, "manuel")));
    await audit({ userId: u.id, action: "stats.suppression", summary: `Saisie supprimée : ${platform}/${metric} du ${day}` });
    return { ok: true as const, message: "Valeur supprimée" };
  });
}

export async function syncNow(provider: string) {
  return run(async () => {
    await assertPermission("stats.voir");
    if (!isConnectorId(provider)) userError("Connecteur inconnu");
    if (!CONNECTORS[provider].isConfigured()) userError("Ce connecteur n'est pas configuré (identifiants d'application manquants).");
    const r = await runSync(provider);
    if (!r.ok) userError(`Synchronisation impossible : ${r.error}`);
    return { ok: true as const, message: r.message };
  });
}

export async function disconnectIntegration(provider: string) {
  return run(async () => {
    const u = await assertPermission("integrations.gerer");
    if (!["google_drive", "youtube", "instagram", "tiktok"].includes(provider)) userError("Intégration inconnue");
    await disconnect(provider as "youtube");
    await audit({ userId: u.id, action: "integration.deconnexion", sensitive: true, summary: `Intégration déconnectée : ${provider} (jetons supprimés)` });
    return { ok: true as const, message: "Intégration déconnectée, jetons supprimés" };
  });
}
