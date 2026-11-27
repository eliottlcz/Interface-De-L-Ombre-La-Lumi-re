import Link from "next/link";
import { sql } from "drizzle-orm";
import { FolderOpen, ExternalLink } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { driveStatus } from "@/lib/integrations/drive";
import { googleConfigured } from "@/lib/integrations/google";
import { Badge, Card, PageHeader, SectionTitle, EmptyState } from "@/components/ui";
import { DriveSearch } from "./drive-search";
import { DrivePanel } from "@/components/drive-panel";

export const metadata = { title: "Google Drive" };

export default async function DrivePage() {
  const user = await requirePagePermission("production.voir");
  const st = await driveStatus();
  const [eps, guests, links] = await Promise.all([
    db.select({ id: s.episodes.id, title: s.episodes.title, number: s.episodes.number, url: s.episodes.driveFolderUrl, fid: s.episodes.driveFolderId }).from(s.episodes).where(sql`${s.episodes.driveFolderUrl} is not null`).orderBy(s.episodes.number),
    can(user, "crm.voir") ? db.select({ id: s.contacts.id, f: s.contacts.firstName, l: s.contacts.lastName, url: s.contacts.driveFolderUrl }).from(s.contacts).where(sql`${s.contacts.driveFolderUrl} is not null`) : Promise.resolve([]),
    db.select({ id: s.resources.id, title: s.resources.title, url: s.resources.url, restricted: s.resources.restricted }).from(s.resources).where(sql`${s.resources.url} like '%google.com%'`),
  ]);
  const visibleLinks = links.filter((r) => !r.restricted || can(user, "ressources.restreintes"));
  return (
    <div>
      <PageHeader eyebrow="Google Drive" title="Les rushs restent sur Drive"
        description="Le QG relie chaque épisode, invité et ressource à ses dossiers Drive, sans stocker les vidéos lourdes sur le serveur." />
      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="font-semibold">État de la connexion</span>
            {st.connected ? <Badge tone={st.lastError ? "alert" : "ok"}>{st.lastError ? "Erreur" : "Connecté"}</Badge> : <Badge tone="muted">{googleConfigured() ? "Non connecté" : "Non configuré"}</Badge>}</div>
          <p className="mt-1 text-sm text-muted">{st.connected ? `Compte : ${st.account ?? "—"}` : googleConfigured() ? "Un administrateur peut connecter le compte Google du média." : "Identifiants Google manquants (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)."} {st.lastError && <span className="text-alert">{st.lastError}</span>}</p>
          {!st.connected && <p className="mt-1 text-xs text-muted">L&apos;application reste utilisable : les liens Drive collés sur les fiches s&apos;ouvrent normalement.</p>}
        </div>
        {can(user, "integrations.gerer") && googleConfigured() && <a href="/api/integrations/connect/google_drive" className="inline-flex h-10 items-center rounded-full bg-gold px-4 text-sm font-semibold text-black">{st.connected ? "Reconnecter" : "Connecter Google Drive"}</a>}
      </Card>
      {st.connected && <Card className="mb-6 p-5"><SectionTitle title="Rechercher dans Drive" /><DriveSearch /></Card>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Dossiers des épisodes" />
          {eps.length === 0 ? <EmptyState title="Aucun dossier associé">Associez ou créez un dossier depuis chaque fiche épisode.</EmptyState> : eps.map((e) => (
            <details key={e.id} className="mb-2 rounded-xl border border-line">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3"><FolderOpen className="size-4 text-gold" /><span className="flex-1 text-sm">{e.number ? `Ép. ${String(e.number).padStart(2, "0")} — ` : ""}{e.title}</span><Link href={`/production/${e.id}`} className="text-xs text-muted hover:text-gold">Fiche</Link></summary>
              <div className="border-t border-line p-4"><DrivePanel target="episode" id={e.id} folderId={e.fid} folderUrl={e.url} connected={st.connected} canEdit={can(user, "production.modifier")} /></div>
            </details>
          ))}
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <SectionTitle title="Dossiers des invités" />
            {guests.length === 0 ? <p className="text-sm text-muted">Aucun dossier invité associé.</p> : guests.map((g) => (
              <a key={g.id} href={g.url!} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-panel-2"><FolderOpen className="size-4 text-gold" /><span className="flex-1">{g.f} {g.l}</span><ExternalLink className="size-3.5 text-muted" /></a>
            ))}
          </Card>
          <Card className="p-5">
            <SectionTitle title="Ressources sur Drive" action={<Link href="/ressources" className="text-xs text-gold">Ressources →</Link>} />
            {visibleLinks.length === 0 ? <p className="text-sm text-muted">Charte, média kit, modèles, documents administratifs : ajoutez leurs liens Drive dans Ressources.</p> : visibleLinks.map((r) => (
              <a key={r.id} href={r.url!} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-panel-2"><ExternalLink className="size-4 text-gold" /><span className="flex-1">{r.title}</span></a>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
