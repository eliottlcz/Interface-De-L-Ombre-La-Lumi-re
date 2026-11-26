"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Download, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmButton, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea, useAction, cx } from "@/components/ui";
import { BarsChart, LinesChart, RankBars } from "@/components/charts";
import { Attachments } from "@/components/attachments";
import { deleteTransaction, saveTransaction, type TxInputT } from "@/actions/finance";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TX_CATEGORIES } from "@/lib/labels";
import { euros, formatDate, todayISO } from "@/lib/dates";
import type { AttachmentView } from "@/lib/queries";

export type Tx = { id: string; type: "depense" | "recette"; date: string; amountCents: number; category: string; ownerId: string | null; ownerName: string | null; description: string; episodeId: string | null; episodeTitle: string | null; status: "regle" | "a_regler"; dueDate: string | null };
const cat = (k: string) => TX_CATEGORIES[k as keyof typeof TX_CATEGORIES] ?? k;
const eur0 = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function FinanceView({ txs, users, episodes, canEdit, canExport, openId, openFiles, initialCreate }: {
  txs: Tx[]; users: { id: string; label: string }[]; episodes: { id: string; label: string }[]; canEdit: boolean; canExport: boolean; openId: string | null; openFiles: AttachmentView[]; initialCreate: "depense" | "recette" | null;
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const years = [...new Set([todayISO().slice(0, 4), ...txs.map((t) => t.date.slice(0, 4))])].sort().reverse();
  const [year, setYear] = useState(years[0]);
  const [type, setType] = useState(""); const [category, setCategory] = useState("");
  const [creating, setCreating] = useState<"depense" | "recette" | null>(canEdit ? initialCreate : null);
  const current = openId ? txs.find((t) => t.id === openId) ?? null : null;
  const setOp = (id: string | null) => { const p = new URLSearchParams(sp.toString()); if (id) p.set("op", id); else p.delete("op"); p.delete("nouveau"); router.replace(`${pathname}?${p}`, { scroll: false }); };

  const inYear = useMemo(() => txs.filter((t) => year === "tout" || t.date.startsWith(year)), [txs, year]);
  const list = inYear.filter((t) => (!type || t.type === type) && (!category || t.category === category));
  const sum = (arr: Tx[], ty: Tx["type"]) => arr.filter((t) => t.type === ty).reduce((a, t) => a + t.amountCents, 0);
  const dep = sum(inYear, "depense"), rec = sum(inYear, "recette");
  const pending = txs.filter((t) => t.status === "a_regler");

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    const arr = inYear.filter((t) => t.date.slice(5, 7) === m);
    return { mois: MONTHS[i], recettes: sum(arr, "recette") / 100, depenses: sum(arr, "depense") / 100 };
  });
  let acc = 0;
  const evolution = [...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => { acc += (t.type === "recette" ? 1 : -1) * t.amountCents; return { date: formatDate(t.date, { day: "numeric", month: "short", year: "2-digit" }), solde: acc / 100 }; });
  const byCat = EXPENSE_CATEGORIES.map((k) => ({ label: cat(k), value: inYear.filter((t) => t.type === "depense" && t.category === k).reduce((a, t) => a + t.amountCents, 0) })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const byEp = Object.values(inYear.filter((t) => t.type === "depense" && t.episodeId).reduce<Record<string, { label: string; value: number; href: string }>>((m, t) => {
    m[t.episodeId!] ??= { label: t.episodeTitle ?? "—", value: 0, href: `/production/${t.episodeId}` }; m[t.episodeId!].value += t.amountCents; return m;
  }, {})).sort((a, b) => b.value - a.value);

  return (
    <div>
      <PageHeader eyebrow="Finances" title="Les coulisses du budget"
        description="Dépenses, recettes, abonnements et échéances. Les justificatifs restent stockés en privé."
        actions={<>
          {canExport && <><a href="/api/export/finances?format=csv" className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm hover:border-gold"><Download className="size-4" />CSV</a>
            <a href="/api/export/finances?format=xlsx" className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm hover:border-gold"><Download className="size-4" />Excel</a></>}
          {canEdit && <><Button onClick={() => setCreating("recette")}><Plus className="size-4" />Recette</Button><Button variant="gold" onClick={() => setCreating("depense")}><Plus className="size-4" />Dépense</Button></>}
        </>} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="h-10 w-auto" aria-label="Année">{years.map((y) => <option key={y} value={y}>{y}</option>)}<option value="tout">Toutes les années</option></Select>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Dépenses", eur0(dep), ""], ["Recettes", eur0(rec), ""], ["Solde", eur0(rec - dep), rec - dep < 0 ? "text-alert" : "text-gold"], ["À régler", eur0(pending.reduce((a, t) => a + t.amountCents, 0)), pending.length ? "text-gold" : ""]].map(([l, v, c]) => (
          <Card key={l} className="p-4"><div className="eyebrow">{l}</div><div className={cx("display mt-2 text-2xl md:text-3xl", c)}>{v}</div></Card>
        ))}
      </div>

      {txs.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="p-5"><BarsChart title="Dépenses et recettes mensuelles" subtitle={year === "tout" ? "Toutes années confondues" : year} data={monthly} xKey="mois" series={[{ key: "recettes", label: "Recettes" }, { key: "depenses", label: "Dépenses" }]} format={(n) => `${Math.round(n).toLocaleString("fr-FR")} €`} /></Card>
          <Card className="p-5"><LinesChart title="Évolution financière" subtitle="Solde cumulé de toutes les opérations" data={evolution} xKey="date" series={[{ key: "solde", label: "Solde" }]} format={(n) => `${Math.round(n).toLocaleString("fr-FR")} €`} /></Card>
          <Card className="p-5"><RankBars title="Répartition des dépenses par catégorie" rows={byCat} format={eur0} /></Card>
          <Card className="p-5"><RankBars title="Dépenses par épisode" rows={byEp} format={eur0} empty="Associez des dépenses à un épisode pour connaître son coût." /></Card>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={type} onChange={(e) => { setType(e.target.value); setCategory(""); }} className="h-10 w-auto" aria-label="Type"><option value="">Dépenses et recettes</option><option value="depense">Dépenses</option><option value="recette">Recettes</option></Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 w-auto" aria-label="Catégorie"><option value="">Toutes catégories</option>{(type === "recette" ? INCOME_CATEGORIES : type === "depense" ? EXPENSE_CATEGORIES : [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]).map((k) => <option key={k} value={k}>{cat(k)}</option>)}</Select>
      </div>
      {list.length === 0 ? <EmptyState title="Aucune opération" action={canEdit && <Button variant="gold" onClick={() => setCreating("depense")}>Ajouter une dépense</Button>}>Studio, matériel, abonnements, déplacements… tout se note ici.</EmptyState> : (
        <Card className="overflow-hidden">
          {list.map((t) => (
            <button key={t.id} onClick={() => setOp(t.id)} className="flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-panel-2">
              <span className="w-16 shrink-0 text-xs text-muted sm:w-20">{formatDate(t.date, { day: "numeric", month: "short" })}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{t.description}</span><span className="block truncate text-xs text-muted">{cat(t.category)}{t.episodeTitle ? ` · ${t.episodeTitle}` : ""}{t.ownerName ? ` · ${t.ownerName}` : ""}</span></span>
              {t.status === "a_regler" && <Badge tone="gold">À régler{t.dueDate ? ` · ${formatDate(t.dueDate, { day: "numeric", month: "short" })}` : ""}</Badge>}
              <span className={cx("shrink-0 tabular-nums text-sm font-semibold", t.type === "recette" ? "text-gold" : "text-cream")}>{t.type === "recette" ? "+" : "−"}{euros(t.amountCents)}</span>
            </button>
          ))}
        </Card>
      )}

      <Modal open={creating !== null} onClose={() => setCreating(null)} title={creating === "recette" ? "Nouvelle recette" : "Nouvelle dépense"}>
        {creating && <TxForm init={null} type={creating} users={users} episodes={episodes} onDone={(id) => { setCreating(null); if (id) setOp(id); }} />}
      </Modal>
      <Modal open={current !== null} onClose={() => setOp(null)} title={current?.type === "recette" ? "Recette" : "Dépense"}>
        {current && (
          <div className="flex flex-col gap-6">
            {canEdit ? <TxForm init={current} type={current.type} users={users} episodes={episodes} onDone={() => setOp(null)} /> : <p>{current.description} — {euros(current.amountCents)}</p>}
            <div><div className="eyebrow mb-2">Justificatifs</div><Attachments entityType="transaction" entityId={current.id} items={openFiles} canEdit={canEdit} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TxForm({ init, type, users, episodes, onDone }: { init: Tx | null; type: "depense" | "recette"; users: { id: string; label: string }[]; episodes: { id: string; label: string }[]; onDone: (id?: string) => void }) {
  const { pending, exec } = useAction();
  const cats = type === "depense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const [v, setV] = useState({ type, date: init?.date ?? todayISO(), amount: init ? String(init.amountCents / 100).replace(".", ",") : "", category: init?.category ?? cats[0], ownerId: init?.ownerId ?? "", description: init?.description ?? "", episodeId: init?.episodeId ?? "", status: init?.status ?? "regle", dueDate: init?.dueDate ?? "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); let id: string | undefined; exec(async () => { const r = await saveTransaction(init?.id ?? null, v as TxInputT); if (r.ok && "data" in r) id = r.data as string; return r; }, { onSuccess: () => onDone(init ? undefined : id) }); }}>
      <Field label="Montant (€)" required><Input inputMode="decimal" value={v.amount} onChange={set("amount")} placeholder="0,00" required /></Field>
      <Field label="Date"><Input type="date" value={v.date} onChange={set("date")} required /></Field>
      <Field label="Catégorie"><Select value={v.category} onChange={set("category")}>{cats.map((k) => <option key={k} value={k}>{cat(k)}</option>)}</Select></Field>
      <Field label="Responsable"><Select value={v.ownerId} onChange={set("ownerId")}><option value="">Moi</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
      <Field label="Description" required className="sm:col-span-2"><Textarea rows={2} value={v.description} onChange={set("description")} required /></Field>
      <Field label="Épisode associé" className="sm:col-span-2"><Select value={v.episodeId} onChange={set("episodeId")}><option value="">—</option>{episodes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></Field>
      <Field label="Statut"><Select value={v.status} onChange={set("status")}><option value="regle">Réglé</option><option value="a_regler">À régler</option></Select></Field>
      {v.status === "a_regler" && <Field label="Échéance"><Input type="date" value={v.dueDate} onChange={set("dueDate")} /></Field>}
      <div className="flex justify-between gap-2 sm:col-span-2">
        {init ? <ConfirmButton variant="ghost" message="Supprimer définitivement cette opération ?" onConfirm={() => exec(() => deleteTransaction(init.id), { onSuccess: () => onDone() })}><Trash2 className="size-4" /></ConfirmButton> : <span />}
        <span className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onDone()}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Enregistrer</Button></span>
      </div>
      {!init && <p className="text-xs text-muted sm:col-span-2">Après l&apos;enregistrement, vous pourrez joindre le justificatif.</p>}
    </form>
  );
}
