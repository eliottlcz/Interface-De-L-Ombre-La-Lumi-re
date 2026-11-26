import "server-only";
import { sql } from "drizzle-orm";
import { db, schema as s } from "@/lib/db";
import { appUrl } from "@/lib/mail";
import { addDaysISO, todayISO } from "@/lib/dates";
import { googleAccessToken, googleAuthUrl, googleConfigured, googleExchange } from "./google";
import { getIntegration, markSynced, readToken, saveTokens, setIntegrationError, type ProviderId } from "./store";

/**
 * Connecteurs de statistiques — architecture indépendante par plateforme.
 * Chaque connecteur déclare : configuration requise, URL d'autorisation OAuth, échange du code,
 * et synchronisation. Aucune valeur n'est inventée : seules les réponses des API sont enregistrées.
 */
export type Connector = {
  id: "youtube" | "instagram" | "tiktok";
  label: string;
  envVars: string[];
  docs: string;
  isConfigured(): boolean;
  authUrl(state: string, challenge: string): string;
  exchange(code: string, verifier: string, userId: string): Promise<void>;
  sync(): Promise<string>;
};

async function snap(platform: string, metric: string, value: number | null | undefined, day = todayISO()) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return;
  await db.insert(s.metricSnapshots).values({ platform, metric, day, value: Number(value), source: "api" })
    .onConflictDoUpdate({ target: [s.metricSnapshots.platform, s.metricSnapshots.metric, s.metricSnapshots.day, s.metricSnapshots.source], set: { value: Number(value), createdAt: new Date() } });
}
async function contentStat(platform: string, externalId: string, kind: string, v: { title?: string | null; url?: string | null; publishedAt?: string | null; metrics: Record<string, number | undefined> }) {
  const metrics = Object.fromEntries(Object.entries(v.metrics).filter(([, x]) => typeof x === "number" && !Number.isNaN(x))) as Record<string, number>;
  await db.insert(s.contentStats).values({ platform, externalId, kind, title: v.title ?? null, url: v.url ?? null, publishedAt: v.publishedAt ? new Date(v.publishedAt) : null, metrics, source: "api" })
    .onConflictDoUpdate({ target: [s.contentStats.platform, s.contentStats.externalId], set: { title: v.title ?? null, metrics, kind, fetchedAt: new Date() } });
}
async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status} : ${JSON.stringify((j as { error?: unknown }).error ?? j).slice(0, 240)}`);
  return j as T;
}
const isoDurationSeconds = (d: string) => { const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0)) : 0; };

/* ───────── YouTube (Data API v3 + Analytics API v2) ───────── */
const youtube: Connector = {
  id: "youtube", label: "YouTube", envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  docs: "Google Cloud Console : activer « YouTube Data API v3 » et « YouTube Analytics API », créer un identifiant OAuth (application Web).",
  isConfigured: googleConfigured,
  authUrl: (state, challenge) => googleAuthUrl("youtube", state, challenge),
  exchange: (code, verifier, userId) => googleExchange("youtube", code, verifier, userId),
  async sync() {
    const token = await googleAccessToken("youtube");
    if (!token) throw new Error("Compte YouTube non connecté ou autorisation expirée.");
    const H = { headers: { Authorization: `Bearer ${token}` } };
    const ch = await getJSON<{ items?: { id: string; snippet: { title: string }; statistics: { subscriberCount?: string; viewCount: string; videoCount: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
      "https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet,contentDetails&mine=true", H);
    const c = ch.items?.[0];
    if (!c) throw new Error("Aucune chaîne YouTube associée à ce compte Google.");
    await snap("youtube", "abonnes", c.statistics.subscriberCount ? Number(c.statistics.subscriberCount) : null);
    await snap("youtube", "vues", Number(c.statistics.viewCount));
    await snap("youtube", "videos", Number(c.statistics.videoCount));
    // Analytics : 28 derniers jours
    const end = todayISO(), start = addDaysISO(end, -28);
    try {
      const a = await getJSON<{ rows?: number[][] }>(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${start}&endDate=${end}&metrics=estimatedMinutesWatched,averageViewDuration,views`, H);
      const row = a.rows?.[0];
      if (row) { await snap("youtube", "heures_visionnage", Math.round(row[0] / 60)); await snap("youtube", "duree_moyenne_s", row[1]); }
    } catch (e) { await setIntegrationError("youtube", `Analytics indisponible : ${(e as Error).message}`); }
    // Vidéos (50 dernières)
    const pl = await getJSON<{ items?: { contentDetails: { videoId: string } }[] }>(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${c.contentDetails.relatedPlaylists.uploads}`, H);
    const ids = (pl.items ?? []).map((i) => i.contentDetails.videoId);
    if (ids.length) {
      const vids = await getJSON<{ items: { id: string; snippet: { title: string; publishedAt: string }; contentDetails: { duration: string }; statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids.join(",")}`, H);
      for (const v of vids.items) {
        const short = isoDurationSeconds(v.contentDetails.duration) <= 180;
        await contentStat("youtube", v.id, short ? "short" : "video", { title: v.snippet.title, url: short ? `https://youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}`, publishedAt: v.snippet.publishedAt,
          metrics: { vues: Number(v.statistics.viewCount ?? NaN), likes: Number(v.statistics.likeCount ?? NaN), commentaires: Number(v.statistics.commentCount ?? NaN) } });
      }
    }
    return `Chaîne « ${c.snippet.title} » : ${ids.length} vidéo(s) actualisée(s)`;
  },
};

/* ───────── Instagram (Graph API via Facebook Login) ───────── */
const IG_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const instagram: Connector = {
  id: "instagram", label: "Instagram", envVars: ["META_APP_ID", "META_APP_SECRET"],
  docs: "Compte Instagram professionnel (Créateur ou Entreprise) relié à une Page Facebook ; application Meta avec « Facebook Login » et les autorisations instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement.",
  isConfigured: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  authUrl: (state) => `https://www.facebook.com/${IG_VERSION}/dialog/oauth?${new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: appUrl("/api/integrations/callback/instagram"), state, scope: "instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management", response_type: "code" })}`,
  async exchange(code, _v, userId) {
    const base = `https://graph.facebook.com/${IG_VERSION}`;
    const short = await getJSON<{ access_token: string }>(`${base}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: appUrl("/api/integrations/callback/instagram"), code })}`);
    const long = await getJSON<{ access_token: string; expires_in?: number }>(`${base}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: short.access_token })}`);
    const pages = await getJSON<{ data: { name: string; instagram_business_account?: { id: string; username?: string } }[] }>(`${base}/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${long.access_token}`);
    const page = pages.data.find((p) => p.instagram_business_account);
    if (!page) throw new Error("Aucun compte Instagram professionnel relié à vos Pages Facebook.");
    await saveTokens("instagram", { accessToken: long.access_token, expiresIn: long.expires_in ?? 60 * 86400, accountLabel: `@${page.instagram_business_account!.username ?? page.name}`, meta: { igUserId: page.instagram_business_account!.id }, userId });
  },
  async sync() {
    const row = await getIntegration("instagram");
    const token = readToken(row?.accessTokenEnc ?? null, "instagram");
    const ig = row?.meta?.igUserId as string | undefined;
    if (!token || !ig) throw new Error("Compte Instagram non connecté.");
    if (row?.expiresAt && row.expiresAt < new Date()) throw new Error("Autorisation Instagram expirée (60 jours) : reconnectez le compte.");
    const base = `https://graph.facebook.com/${IG_VERSION}`;
    const acc = await getJSON<{ followers_count: number; media_count: number; username: string }>(`${base}/${ig}?fields=followers_count,media_count,username&access_token=${token}`);
    await snap("instagram", "abonnes", acc.followers_count);
    await snap("instagram", "publications", acc.media_count);
    for (const metric of ["reach", "views", "total_interactions"] as const) {
      try {
        const r = await getJSON<{ data: { total_value?: { value: number } }[] }>(`${base}/${ig}/insights?metric=${metric}&period=day&metric_type=total_value&access_token=${token}`);
        const v = r.data[0]?.total_value?.value;
        await snap("instagram", metric === "reach" ? "portee" : metric === "views" ? "vues" : "interactions", v ?? null);
      } catch { /* indicateur non disponible pour ce compte : rien n'est enregistré */ }
    }
    const media = await getJSON<{ data: { id: string; caption?: string; media_product_type?: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number }[] }>(
      `${base}/${ig}/media?fields=id,caption,media_product_type,permalink,timestamp,like_count,comments_count&limit=40&access_token=${token}`);
    for (const m of media.data) {
      let views: number | undefined, reach: number | undefined, shares: number | undefined;
      try {
        const ins = await getJSON<{ data: { name: string; values: { value: number }[] }[] }>(`${base}/${m.id}/insights?metric=views,reach,shares&access_token=${token}`);
        for (const d of ins.data) { const v = d.values?.[0]?.value; if (d.name === "views") views = v; if (d.name === "reach") reach = v; if (d.name === "shares") shares = v; }
      } catch { /* insights indisponibles sur ce média */ }
      await contentStat("instagram", m.id, m.media_product_type === "REELS" ? "reel" : "post", { title: m.caption?.slice(0, 140) ?? null, url: m.permalink, publishedAt: m.timestamp,
        metrics: { likes: m.like_count, commentaires: m.comments_count, vues: views, portee: reach, partages: shares } });
    }
    return `@${acc.username} : ${media.data.length} publication(s) actualisée(s)`;
  },
};

/* ───────── TikTok (Login Kit + Display API v2) ───────── */
const tiktok: Connector = {
  id: "tiktok", label: "TikTok", envVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  docs: "TikTok for Developers : application avec « Login Kit » et les autorisations user.info.basic, user.info.stats, video.list (soumise à validation par TikTok).",
  isConfigured: () => Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
  authUrl: (state) => `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, scope: "user.info.basic,user.info.stats,video.list", response_type: "code", redirect_uri: appUrl("/api/integrations/callback/tiktok"), state })}`,
  async exchange(code, _v, userId) {
    const j = await getJSON<{ access_token: string; refresh_token: string; expires_in: number; scope: string; open_id: string }>("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, code, grant_type: "authorization_code", redirect_uri: appUrl("/api/integrations/callback/tiktok") }),
    });
    await saveTokens("tiktok", { accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in, scopes: j.scope, meta: { openId: j.open_id }, userId });
  },
  async sync() {
    const row = await getIntegration("tiktok");
    let token = readToken(row?.accessTokenEnc ?? null, "tiktok");
    if (!token) throw new Error("Compte TikTok non connecté.");
    if (row?.expiresAt && row.expiresAt < new Date()) {
      const refresh = readToken(row.refreshTokenEnc, "tiktok");
      const j = await getJSON<{ access_token: string; refresh_token: string; expires_in: number }>("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, grant_type: "refresh_token", refresh_token: refresh ?? "" }),
      });
      await saveTokens("tiktok", { accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in });
      token = j.access_token;
    }
    const H = { Authorization: `Bearer ${token}` };
    const u = await getJSON<{ data: { user: { display_name: string; follower_count: number; likes_count: number; video_count: number } } }>("https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count,likes_count,video_count", { headers: H });
    await snap("tiktok", "abonnes", u.data.user.follower_count);
    await snap("tiktok", "likes", u.data.user.likes_count);
    await snap("tiktok", "videos", u.data.user.video_count);
    await db.update(s.integrations).set({ accountLabel: u.data.user.display_name }).where(sql`${s.integrations.provider} = 'tiktok'`);
    let cursor: number | undefined; let total = 0; const sums = { vues: 0, commentaires: 0, partages: 0 };
    for (let page = 0; page < 5; page++) {
      const v = await getJSON<{ data: { videos: { id: string; title?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number; create_time?: number; share_url?: string }[]; cursor: number; has_more: boolean } }>(
        "https://open.tiktokapis.com/v2/video/list/?fields=id,title,view_count,like_count,comment_count,share_count,create_time,share_url", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) });
      for (const x of v.data.videos) {
        total++; sums.vues += x.view_count ?? 0; sums.commentaires += x.comment_count ?? 0; sums.partages += x.share_count ?? 0;
        await contentStat("tiktok", x.id, "tiktok", { title: x.title ?? null, url: x.share_url ?? null, publishedAt: x.create_time ? new Date(x.create_time * 1000).toISOString() : null,
          metrics: { vues: x.view_count, likes: x.like_count, commentaires: x.comment_count, partages: x.share_count } });
      }
      if (!v.data.has_more) break; cursor = v.data.cursor;
    }
    // Totaux calculés sur les vidéos effectivement renvoyées par l'API
    if (total) { await snap("tiktok", "vues", sums.vues); await snap("tiktok", "commentaires", sums.commentaires); await snap("tiktok", "partages", sums.partages); }
    return `${u.data.user.display_name} : ${total} vidéo(s) actualisée(s)`;
  },
};

export const CONNECTORS: Record<Connector["id"], Connector> = { youtube, instagram, tiktok };
export const isConnectorId = (x: string): x is Connector["id"] => x in CONNECTORS;

/** Synchronise un connecteur et trace le résultat (succès / erreur) — jamais de données inventées. */
export async function runSync(id: Connector["id"]) {
  const [runRow] = await db.insert(s.syncRuns).values({ provider: id, status: "en_cours" }).returning();
  try {
    const msg = await CONNECTORS[id].sync();
    await markSynced(id as ProviderId);
    await db.update(s.syncRuns).set({ status: "succes", message: msg, finishedAt: new Date() }).where(sql`${s.syncRuns.id} = ${runRow.id}`);
    return { ok: true as const, message: msg };
  } catch (e) {
    const msg = (e as Error).message;
    await setIntegrationError(id as ProviderId, msg);
    await db.update(s.syncRuns).set({ status: "erreur", message: msg, finishedAt: new Date() }).where(sql`${s.syncRuns.id} = ${runRow.id}`);
    return { ok: false as const, error: msg };
  }
}
