import Link from "next/link";
import { Ago } from "@/components/ui";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { listUsers } from "@/lib/queries";
import { Avatar, Card, PageHeader, EmptyState } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/dates";

export const metadata = { title: "Fil d'activité" };

const LINK: Record<string, string> = { task: "/missions?espace=tout&tache=", contact: "/crm/", episode: "/production/", transaction: "/finances?op=", event: "/calendrier?evenement=" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ qui?: string; avant?: string }> }) {
  const user = await requireUser();
  const { qui, avant } = await searchParams;
  const conds: SQL[] = [];
  if (!can(user, "journal.voir")) conds.push(eq(s.auditLog.sensitive, false));
  if (qui && /^[0-9a-f-]{36}$/.test(qui)) conds.push(eq(s.auditLog.userId, qui));
  if (avant && !Number.isNaN(Date.parse(avant))) conds.push(lt(s.auditLog.createdAt, new Date(avant)));
  const [rows, users] = await Promise.all([
    db.select({ a: s.auditLog, name: s.users.name }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.userId)).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.auditLog.createdAt)).limit(100),
    listUsers(),
  ]);
  const hidden = (t: string | null) => (t === "transaction" && !can(user, "finances.voir")) || t === "vault";
  return (
    <div>
      <PageHeader eyebrow="Activité" title="Le journal de bord" description="Tout ce qui bouge dans le QG, en temps réel." />
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Link href="/activite" className={`rounded-full border px-3 py-1.5 ${!qui ? "border-gold text-cream" : "border-line text-muted"}`}>Toute l&apos;équipe</Link>
        {users.map((u) => <Link key={u.id} href={`/activite?qui=${u.id}`} className={`rounded-full border px-3 py-1.5 ${qui === u.id ? "border-gold text-cream" : "border-line text-muted"}`}>{u.name}</Link>)}
      </div>
      {rows.length === 0 ? <EmptyState title="Aucune activité">Les actions de l&apos;équipe apparaîtront ici.</EmptyState> : (
        <Card className="overflow-hidden">
          {rows.filter(({ a }) => !hidden(a.entityType)).map(({ a, name }) => {
            const href = a.entityType && a.entityId && LINK[a.entityType] ? LINK[a.entityType] + a.entityId : null;
            const body = <><Avatar name={name ?? "Système"} size={28} /><span className="min-w-0 flex-1"><span className="block text-sm"><span className="font-medium">{name ?? "Automatisation"}</span> — {a.summary}</span><span className="text-[11px] text-muted" title={formatDateTime(a.createdAt)}><Ago value={a.createdAt} />{a.sensitive && " · action sensible"}</span></span></>;
            return href
              ? <Link key={a.id} href={href} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-panel-2">{body}</Link>
              : <div key={a.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">{body}</div>;
          })}
        </Card>
      )}
      {rows.length === 100 && <Link href={`/activite?${qui ? `qui=${qui}&` : ""}avant=${rows[rows.length - 1].a.createdAt.toISOString()}`} className="mt-4 inline-block text-sm text-gold">Plus ancien →</Link>}
    </div>
  );
}
