/** Utilitaires de dates — fuseau Europe/Paris, format français. */
export const TZ = "Europe/Paris";

/** Date du jour (AAAA-MM-JJ) à Paris. */
export function todayISO(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function diffDaysISO(a: string, b: string): number {
  const pa = Date.UTC(...(a.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]));
  const pb = Date.UTC(...(b.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]));
  return Math.round((pa - pb) / 864e5);
}
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, ...o });

export function formatDate(v: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!v) return "—";
  const d = typeof v === "string" ? (v.length === 10 ? new Date(v + "T12:00:00Z") : new Date(v)) : v;
  return fmt(opts).format(d);
}
export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  return fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}
export function formatTime(v: string | Date): string {
  return fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}
/** "aujourd'hui", "demain", "dans 3 j", "il y a 2 j" */
export function relativeDay(iso: string | null | undefined, today = todayISO()): string {
  if (!iso) return "—";
  const n = diffDaysISO(iso.slice(0, 10), today);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  if (n === -1) return "hier";
  return n > 0 ? `dans ${n} j` : `il y a ${-n} j`;
}
export function timeAgo(v: string | Date): string {
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `il y a ${d} j` : formatDate(new Date(v));
}
/** Convertit "AAAA-MM-JJ" + "HH:MM" (heure de Paris) en Date UTC. */
export function parisToUtc(dateISO: string, time = "00:00"): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asParis = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess.getTime() - (asParis - guess.getTime()));
}
/** Date + heure Paris d'un instant : { date: "AAAA-MM-JJ", time: "HH:MM" } */
export function utcToParis(v: Date | string): { date: string; time: string } {
  const d = new Date(v);
  const t = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date: todayISO(d), time: t };
}
export function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
