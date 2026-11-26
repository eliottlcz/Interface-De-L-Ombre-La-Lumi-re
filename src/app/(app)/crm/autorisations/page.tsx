import Link from "next/link";
import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { loadGuestDocs } from "@/lib/guest-doc-queries";
import { GuestDocs } from "@/components/crm/guest-docs";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Autorisations des invités" };

export default async function AuthorizationsPage() {
  const user = await requirePagePermission("production.voir");
  const docs = await loadGuestDocs();
  const guestsWithout = await db.select({ id: s.contacts.id, firstName: s.contacts.firstName, lastName: s.contacts.lastName }).from(s.contacts)
    .where(and(eq(s.contacts.category, "invite_recu"), isNull(s.contacts.archivedAt),
      notExists(db.select({ x: sql`1` }).from(s.guestDocuments).where(and(eq(s.guestDocuments.contactId, s.contacts.id), eq(s.guestDocuments.kind, "droit_image"))))));
  const groups = [
    { key: "manquant", label: "Manquants", list: docs.filter((d) => d.status === "manquant") },
    { key: "demande", label: "Demandés, en attente", list: docs.filter((d) => d.status === "demande") },
    { key: "recu", label: "Reçus — à valider", list: docs.filter((d) => d.status === "recu") },
    { key: "valide", label: "Validés", list: docs.filter((d) => d.status === "valide") },
  ];
  const edit = can(user, "production.modifier");
  return (
    <div>
      <Link href="/crm" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold"><ArrowLeft className="size-4" />Invités & CRM</Link>
      <PageHeader eyebrow="Gestion administrative" title="Autorisations des invités"
        description="Droit à l'image, autorisation de diffusion, documents de production. Un document n'est jamais considéré comme signé sans preuve de réception." />
      {guestsWithout.length > 0 && (
        <div className="mb-6 rounded-xl border border-alert/40 bg-alert/5 p-4 text-sm">
          <div className="font-semibold text-alert">Invités reçus sans autorisation de droit à l&apos;image suivie</div>
          <div className="mt-2 flex flex-wrap gap-2">{guestsWithout.map((g) => <Link key={g.id} href={`/crm/${g.id}#documents`} className="rounded-full border border-line px-3 py-1 hover:border-gold">{g.firstName} {g.lastName}</Link>)}</div>
        </div>
      )}
      {docs.length === 0 ? <EmptyState title="Aucun document suivi">Les autorisations attendues sont créées automatiquement quand un invité est confirmé, ou depuis sa fiche.</EmptyState> : (
        <div className="grid gap-6 xl:grid-cols-2">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="eyebrow mb-2">{g.label} · {g.list.length}</div>
              <GuestDocs docs={g.list} canEdit={edit} showContact />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
