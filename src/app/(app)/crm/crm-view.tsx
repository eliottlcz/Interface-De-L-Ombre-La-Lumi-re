"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Table2, Columns3, ShieldCheck, Mail, Phone } from "lucide-react";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Input, Modal, PageHeader, Segmented, Select, Tabs, useAction, cx } from "@/components/ui";
import { Kanban } from "@/components/kanban";
import { ContactForm, emptyContact } from "@/components/crm/contact-form";
import { moveContact } from "@/actions/crm";
import { CONTACT_CATEGORY, CONTACT_CATEGORY_ORDER, PRIORITY } from "@/lib/labels";
import { formatDate, relativeDay, todayISO } from "@/lib/dates";
import type { Socials } from "@/lib/db/schema";

type Cat = "a_contacter" | "mail_envoye" | "a_relancer" | "invite_recu";
export type ContactRow = {
  id: string; firstName: string; lastName: string; profession: string | null; company: string | null; email: string | null; phone: string | null;
  socials: Socials; category: Cat; priority: "basse" | "normale" | "haute" | "urgente"; ownerId: string | null; ownerName: string | null;
  whyInteresting: string | null; lastContactAt: string | null; lastEmailSubject: string | null; responseReceived: boolean; followupCount: number;
  nextAction: string | null; nextFollowupAt: string | null; shootDate: string | null; publishDate: string | null; episodeUrl: string | null;
  archived: boolean; episodeId: string | null; updatedAt: string;
};

const name = (c: ContactRow) => `${c.firstName} ${c.lastName}`.trim();
const prioTone = (p: ContactRow["priority"]) => (p === "urgente" ? "alert" : p === "haute" ? "gold" : p === "basse" ? "muted" : "neutral");

export function CrmView({ contacts, users, meId, canEdit, initialCreate, initialQuery }: { contacts: ContactRow[]; users: { id: string; label: string }[]; meId: string; canEdit: boolean; initialCreate: boolean; initialQuery: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const tab = (sp.get("categorie") ?? "a_contacter") as Cat | "archives" | "tous";
  const view = (sp.get("vue") ?? "tableau") as "tableau" | "kanban";
  const [q, setQ] = useState(initialQuery);
  const [owner, setOwner] = useState("");
  const [prio, setPrio] = useState("");
  const [creating, setCreating] = useState(initialCreate);
  const { exec } = useAction();
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); p.set(k, v); p.delete("nouveau"); router.replace(`${pathname}?${p}`, { scroll: false }); };

  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts.filter((c) => (!owner || c.ownerId === owner) && (!prio || c.priority === prio) &&
      (!term || [name(c), c.profession, c.company, c.email, c.phone, c.whyInteresting].some((x) => x?.toLowerCase().includes(term))));
  }, [contacts, q, owner, prio]);
  const active = base.filter((c) => !c.archived);
  const list = tab === "archives" ? base.filter((c) => c.archived) : tab === "tous" ? active : active.filter((c) => c.category === tab);
  const today = todayISO();

  const tabs = [
    ...CONTACT_CATEGORY_ORDER.map((k) => ({ value: k, label: CONTACT_CATEGORY[k], count: active.filter((c) => c.category === k).length })),
    { value: "tous", label: "Tous", count: active.length },
    { value: "archives", label: "Archivés", count: base.filter((c) => c.archived).length },
  ];

  return (
    <div>
      <PageHeader eyebrow="Invités & CRM" title="Ceux qu'on va mettre en lumière"
        description="Prospection, relances et invités reçus : une fiche par personne, avec tout son historique."
        actions={<>
          <ButtonLink href="/crm/autorisations" variant="ghost"><ShieldCheck className="size-4" />Autorisations</ButtonLink>
          {canEdit && <Button variant="gold" onClick={() => setCreating(true)}><Plus className="size-4" />Ajouter un contact</Button>}
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, métier, entreprise, e-mail…" className="pl-9" aria-label="Rechercher un contact" />
        </div>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-10 w-auto" aria-label="Responsable">
          <option value="">Tous responsables</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </Select>
        <Select value={prio} onChange={(e) => setPrio(e.target.value)} className="h-10 w-auto" aria-label="Priorité">
          <option value="">Toutes priorités</option>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <div className="ml-auto"><Segmented value={view} onChange={(v) => setParam("vue", v)} items={[{ value: "tableau", label: <span className="inline-flex items-center gap-1"><Table2 className="size-3.5" />Tableau</span> }, { value: "kanban", label: <span className="inline-flex items-center gap-1"><Columns3 className="size-3.5" />Kanban</span> }]} /></div>
      </div>

      {view === "kanban" ? (
        <Kanban
          columns={CONTACT_CATEGORY_ORDER.map((k) => ({ id: k, label: CONTACT_CATEGORY[k], accent: k === "invite_recu" }))}
          items={active.map((c) => ({ ...c, column: c.category }))}
          disabled={!canEdit}
          onMove={(id, col) => exec(() => moveContact(id, col as Cat))}
          renderCard={(c) => (
            <div className="rounded-xl border border-line bg-night p-3">
              <Link href={`/crm/${c.id}`} className="block">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{name(c)}</span><Avatar name={c.ownerName} size={22} /></div>
                {c.profession && <div className="truncate text-xs text-muted">{c.profession}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={prioTone(c.priority)}>{PRIORITY[c.priority]}</Badge>
                  {c.nextFollowupAt && <Badge tone={c.nextFollowupAt <= today ? "alert" : "neutral"}>Relance {relativeDay(c.nextFollowupAt)}</Badge>}
                </div>
              </Link>
              {canEdit && (
                <select aria-label="Déplacer vers" value={c.category} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => exec(() => moveContact(c.id, e.target.value as Cat))}
                  className="mt-2 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-soft md:hidden">
                  {CONTACT_CATEGORY_ORDER.map((k) => <option key={k} value={k}>→ {CONTACT_CATEGORY[k]}</option>)}
                </select>
              )}
            </div>
          )} />
      ) : (
        <>
          <Tabs value={tab} onChange={(v) => setParam("categorie", v)} items={tabs} className="mb-4" />
          {list.length === 0 ? (
            <EmptyState title={q ? "Personne ne correspond" : "Personne ici pour l'instant"} action={canEdit && !q && tab !== "archives" && <Button variant="gold" onClick={() => setCreating(true)}>Ajouter un contact</Button>}>
              {tab === "a_contacter" && !q ? "Ceux qu'on entend moins, ceux qui ne sont jamais sur les tapis rouges : notez ici les profils à approcher." : "Modifiez les filtres ou la recherche."}
            </EmptyState>
          ) : (
            <>
              {/* Tableau (tablette / ordinateur) */}
              <div className="card hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <tr>{columnsFor(tab).map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id} onClick={() => router.push(`/crm/${c.id}`)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2">
                        {cellsFor(tab, c, today).map((cell, i) => <td key={i} className="px-4 py-3 align-top">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Cartes (smartphone) */}
              <div className="flex flex-col gap-2 md:hidden">
                {list.map((c) => (
                  <Link key={c.id} href={`/crm/${c.id}`} className="rounded-xl border border-line bg-panel p-4 active:bg-panel-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{name(c)}</div>
                        <div className="truncate text-sm text-muted">{[c.profession, c.company].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <Badge tone={prioTone(c.priority)}>{PRIORITY[c.priority]}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-soft">
                      {mobileFacts(c, today).map(([k, v]) => <div key={k}><div className="text-muted">{k}</div><div className="truncate">{v}</div></div>)}
                    </div>
                    <div className="mt-3 flex gap-2">
                      {c.email && <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs"><Mail className="size-3.5" />E-mail</a>}
                      {c.phone && <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs"><Phone className="size-3.5" />Appeler</a>}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nouveau contact" wide>
        <ContactForm value={emptyContact(tab === "archives" || tab === "tous" ? "a_contacter" : tab, meId)} users={users}
          onDone={(id) => { setCreating(false); if (id) router.push(`/crm/${id}`); }} />
      </Modal>
    </div>
  );
}

function columnsFor(tab: string) {
  switch (tab) {
    case "invite_recu": return ["Invité", "Profession", "Tournage", "Publication", "Épisode", "Responsable"];
    case "mail_envoye": return ["Nom", "Envoyé le", "Objet", "Réponse", "Prochaine action", "Relance", "Responsable"];
    case "a_relancer": return ["Nom", "Dernier contact", "Relances", "Prochaine relance", "Responsable"];
    case "a_contacter": return ["Nom", "Profession", "Pourquoi", "Priorité", "Responsable"];
    default: return ["Nom", "Catégorie", "Profession", "Prochaine relance", "Responsable"];
  }
}
function cellsFor(tab: string, c: ContactRow, today: string): React.ReactNode[] {
  const who = <span className="flex items-center gap-2"><Avatar name={c.ownerName} size={22} /><span className="text-soft">{c.ownerName ?? "—"}</span></span>;
  const nm = <span className="font-medium">{name(c)}</span>;
  const relance = c.nextFollowupAt ? <span className={cx(c.nextFollowupAt <= today && "font-semibold text-alert")}>{formatDate(c.nextFollowupAt)}</span> : "—";
  switch (tab) {
    case "invite_recu": return [nm, c.profession ?? "—", formatDate(c.shootDate), formatDate(c.publishDate), c.episodeUrl ? <a href={c.episodeUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-gold">Voir</a> : c.episodeId ? <Link href={`/production/${c.episodeId}`} onClick={(e) => e.stopPropagation()} className="text-gold">Fiche épisode</Link> : "—", who];
    case "mail_envoye": return [nm, formatDate(c.lastContactAt), <span key="s" className="line-clamp-1 max-w-[220px]">{c.lastEmailSubject ?? "—"}</span>, c.responseReceived ? <Badge tone="ok">Reçue</Badge> : <Badge tone="muted">En attente</Badge>, <span key="a" className="line-clamp-1 max-w-[200px]">{c.nextAction ?? "—"}</span>, relance, who];
    case "a_relancer": return [nm, formatDate(c.lastContactAt), c.followupCount, relance, who];
    case "a_contacter": return [nm, c.profession ?? "—", <span key="w" className="line-clamp-2 max-w-[320px] text-soft">{c.whyInteresting ?? "—"}</span>, <Badge key="p" tone={prioTone(c.priority)}>{PRIORITY[c.priority]}</Badge>, who];
    default: return [nm, CONTACT_CATEGORY[c.category], c.profession ?? "—", relance, who];
  }
}
function mobileFacts(c: ContactRow, today: string): [string, string][] {
  const f: [string, string][] = [["Catégorie", CONTACT_CATEGORY[c.category]], ["Responsable", c.ownerName ?? "—"]];
  if (c.category === "invite_recu") f.push(["Tournage", formatDate(c.shootDate)], ["Publication", formatDate(c.publishDate)]);
  else if (c.category === "a_contacter") f.push(["Pourquoi", c.whyInteresting ?? "—"]);
  else f.push(["Dernier contact", formatDate(c.lastContactAt)], ["Relance", c.nextFollowupAt ? (c.nextFollowupAt <= today ? "⚠ " : "") + relativeDay(c.nextFollowupAt) : "—"]);
  if (c.category === "a_relancer") f.push(["Relances", String(c.followupCount)]);
  return f;
}
