import { desc, eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { listAttachments, listEpisodeOptions, listUsers, episodeLabel } from "@/lib/queries";
import { FinanceView, type Tx } from "./finance-view";

export const metadata = { title: "Finances" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("finances.voir");
  const sp = await searchParams;
  const [rows, users, episodes] = await Promise.all([
    db.select({ t: s.transactions, ownerName: s.users.name, episodeTitle: s.episodes.title }).from(s.transactions)
      .leftJoin(s.users, eq(s.users.id, s.transactions.ownerId)).leftJoin(s.episodes, eq(s.episodes.id, s.transactions.episodeId)).orderBy(desc(s.transactions.date)),
    listUsers(), listEpisodeOptions(),
  ]);
  const txs: Tx[] = rows.map(({ t, ownerName, episodeTitle }) => ({ id: t.id, type: t.type, date: t.date, amountCents: t.amountCents, category: t.category, ownerId: t.ownerId, ownerName, description: t.description, episodeId: t.episodeId, episodeTitle, status: t.status, dueDate: t.dueDate }));
  const openId = sp.op && txs.some((t) => t.id === sp.op) ? sp.op : null;
  return <FinanceView txs={txs} users={users.map((u) => ({ id: u.id, label: u.name }))} episodes={episodes.map((e) => ({ id: e.id, label: episodeLabel(e) }))}
    canEdit={can(user, "finances.modifier")} canExport={can(user, "exports.faire")}
    openId={openId} openFiles={openId ? await listAttachments("transaction", openId) : []} initialCreate={sp.nouveau === "depense" || sp.nouveau === "recette" ? sp.nouveau : null} />;
}
