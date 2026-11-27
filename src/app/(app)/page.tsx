import Link from "next/link";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { Plus, UserPlus, Clapperboard, CalendarPlus, Film, Wallet, ChartColumn, FolderPlus, Lightbulb, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { getReminders } from "@/lib/reminders";
import { loadTasks } from "@/lib/task-queries";
import { crossPlatform, internalCounts, metricAtOrBefore } from "@/lib/metrics";
import { isAiConfigured } from "@/lib/ai-config";
import { addDaysISO, compact, formatDate, timeAgo, todayISO, utcToParis } from "@/lib/dates";
import { PLATFORMS, type PlatformKey } from "@/lib/labels";
import { Card, SectionTitle, Avatar, EmptyState } from "@/components/ui";
import { ReminderRow } from "@/components/dashboard/reminder-list";
import { HomeTasks } from "./home-tasks";

export const metadata = { title: "Vue d'ensemble" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "Encore dans l'ombre" : h < 18 ? "Bonjour" : "Bonsoir";
}

export default async function Home({ searchParams }: { searchParams: Promise<{ refus?: string }> }) {
  const user = await requireUser();
  const { refus } = await searchParams;
  const today = todayISO();
  const first = user.name.split(" ")[0];
  const [reminders, myTasks, counts, followers, views, others, shootsToday, ideas] = await Promise.all([
    getReminders(user),
    can(user, "taches.voir") ? loadTasks(and(eq(s.tasks.assigneeId, user.id), ne(s.tasks.status, "termine"))) : Promise.resolve([]),
    internalCounts(),
    can(user, "stats.voir") ? crossPlatform("abonnes") : Promise.resolve({ total: null, parts: [] }),
    can(user, "stats.voir") ? crossPlatform("vues") : Promise.resolve({ total: null, parts: [] }),
    db.select({ a: s.auditLog, name: s.users.name }).from(s.auditLog).innerJoin(s.users, eq(s.users.id, s.auditLog.userId))
      .where(and(ne(s.auditLog.userId, user.id), eq(s.auditLog.sensitive, false))).orderBy(desc(s.auditLog.createdAt)).limit(8),
    db.select({ id: s.episodes.id, title: s.episodes.title, shootDate: s.episodes.shootDate }).from(s.episodes).where(sql`${s.episodes.shootDate} is not null`),
    can(user, "idees.voir") ? db.select().from(s.ideas).where(eq(s.ideas.day, today)).limit(2) : Promise.resolve([]),
  ]);
  const shootToday = shootsToday.find((e) => utcToParis(e.shootDate!).date === today);
  const nextShoot = shootsToday.filter((e) => utcToParis(e.shootDate!).date >= today).sort((a, b) => a.shootDate!.getTime() - b.shootDate!.getTime())[0];
  const urgent = reminders.filter((r) => r.urgency === "retard" || r.urgency === "aujourdhui");
  // Évolution de la communauté sur 30 jours (uniquement si un historique existe)
  let growth: number | null = null;
  if (followers.parts.length) {
    const past = await Promise.all(followers.parts.map((p) => metricAtOrBefore(p.platform, "abonnes", addDaysISO(today, -30))));
    if (past.every((v) => v !== null)) growth = followers.total! - past.reduce<number>((a, v) => a + (v ?? 0), 0);
  }
  const supervise = can(user, "utilisateurs.gerer") ? await loadTasks(and(ne(s.tasks.status, "termine"), sql`${s.tasks.assigneeId} is not null and ${s.tasks.assigneeId} <> ${user.id}`)) : [];
  const users = await db.select({ id: s.users.id, name: s.users.name }).from(s.users);
  const uname = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;

  const kpis: { label: string; value: string; hint: string; href?: string }[] = [
    { label: "Abonnés (toutes plateformes)", value: compact(followers.total), hint: followers.parts.length ? followers.parts.map((p) => PLATFORMS[p.platform as PlatformKey]).join(" · ") : "Aucune donnée — connectez ou saisissez vos statistiques", href: "/statistiques" },
    { label: "Vues cumulées", value: compact(views.total), hint: views.parts.length ? `${views.parts.length} plateforme(s)` : "Aucune donnée disponible", href: "/statistiques" },
    { label: "Vidéos publiées", value: String(counts.contenusPublies), hint: "Contenus vidéo marqués publiés", href: "/contenus" },
    { label: "Épisodes disponibles", value: String(counts.episodesDisponibles), hint: "Épisodes publiés", href: "/production" },
    { label: "Invités reçus", value: String(counts.invitesRecus), hint: "Fiches « Invités reçus »", href: "/crm?categorie=invite_recu" },
    { label: "Personnes contactées", value: String(counts.contactes), hint: "Au moins un échange enregistré", href: "/crm?categorie=tous" },
    { label: "Collaborations en cours", value: String(counts.enProduction), hint: "Épisodes confirmés, non publiés", href: "/production" },
    { label: "Évolution de la communauté", value: growth === null ? "—" : `${growth >= 0 ? "+" : ""}${compact(growth)}`, hint: growth === null ? "Historique d'abonnés insuffisant (30 j)" : "Abonnés gagnés sur 30 jours", href: "/statistiques" },
  ];
  const shortcuts = [
    { label: "Ajouter un invité", href: "/crm?nouveau=1", Icon: UserPlus, perm: "crm.modifier" },
    { label: "Ajouter une tâche", href: "/missions?nouveau=1", Icon: Plus, perm: "taches.modifier" },
    { label: "Créer un épisode", href: "/production?nouveau=1", Icon: Clapperboard, perm: "production.modifier" },
    { label: "Programmer un tournage", href: "/calendrier?nouveau=tournage", Icon: CalendarPlus, perm: "calendrier.modifier" },
    { label: "Ajouter une publication", href: "/contenus?nouveau=1", Icon: Film, perm: "production.modifier" },
    { label: "Ajouter une dépense", href: "/finances?nouveau=depense", Icon: Wallet, perm: "finances.modifier" },
    { label: "Statistiques", href: "/statistiques", Icon: ChartColumn, perm: "stats.voir" },
    { label: "Ajouter une ressource", href: "/ressources?nouveau=1", Icon: FolderPlus, perm: "ressources.modifier" },
  ].filter((x) => can(user, x.perm as Parameters<typeof can>[1]));

  return (
    <div className="flex flex-col gap-8">
      {refus && <div className="rounded-xl border border-alert/40 bg-alert/10 px-4 py-3 text-sm">Cette rubrique n&apos;est pas ouverte à votre profil. Un administrateur peut ajuster vos permissions.</div>}

      <section className="relative overflow-hidden rounded-[20px] border border-line spotlight px-6 py-8 md:stripe-diagonal md:px-10 md:py-10 lights-up">
        <div className="relative z-10 max-w-3xl">
          <div className="eyebrow mb-3">{new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</div>
          <h1 className="display text-[28px] md:text-5xl">{greeting()}, <span className="text-gold">{first}</span></h1>
          <p className="mt-4 text-[15px] leading-relaxed text-soft md:text-base">
            {shootToday ? <><span className="quote text-xl text-gold">Silence, on tourne.</span> Aujourd&apos;hui : <Link href={`/production/${shootToday.id}`} className="text-cream underline decoration-gold/50 underline-offset-4">{shootToday.title}</Link>.</>
              : urgent.length ? <>{urgent.length} point{urgent.length > 1 ? "s" : ""} demande{urgent.length > 1 ? "nt" : ""} votre attention aujourd&apos;hui.</>
              : <>Rien d&apos;urgent. Le bon moment pour préparer ce que personne ne voit.</>}
            {nextShoot && !shootToday && <> Prochain tournage : <Link href={`/production/${nextShoot.id}`} className="text-cream underline decoration-gold/50 underline-offset-4">{nextShoot.title}</Link>, {formatDate(nextShoot.shootDate!, { weekday: "long", day: "numeric", month: "long" })}.</>}
          </p>
        </div>
      </section>

      {can(user, "stats.voir") && (
        <section>
          <SectionTitle eyebrow="Le média en chiffres" title="Indicateurs généraux" action={<Link href="/statistiques" className="text-xs text-gold">Toutes les statistiques →</Link>} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Link key={k.label} href={k.href ?? "#"} className="card lightable p-4">
                <div className="text-[11px] font-medium text-muted">{k.label}</div>
                <div className="display mt-2 text-2xl md:text-[30px]">{k.value}</div>
                <div className="mt-1 line-clamp-2 text-[11px] text-muted">{k.hint}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-0">
            <div className="p-5 pb-2"><SectionTitle title="Urgences" eyebrow="En retard et aujourd'hui" action={<Link href="/a-ne-pas-oublier" className="text-xs text-gold">À ne pas oublier →</Link>} /></div>
            {urgent.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Tout est sous contrôle. Rien ne traîne dans l&apos;ombre.</p>
              : <div>{urgent.slice(0, 7).map((r) => <ReminderRow key={r.key} r={r} owner={uname(r.ownerId)} />)}</div>}
          </Card>
          {can(user, "taches.voir") && <HomeTasks tasks={myTasks} canEdit={can(user, "taches.modifier")} title={`Les missions de ${first}`} />}
          {supervise.length > 0 && (
            <Card className="p-5">
              <SectionTitle title="Missions à superviser" eyebrow="Attribuées à l'équipe" action={<Link href="/missions?espace=tout" className="text-xs text-gold">Toutes →</Link>} />
              <ul className="flex flex-col">{supervise.slice(0, 6).map((t) => (
                <li key={t.id}><Link href={`/missions?espace=tout&tache=${t.id}`} className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0 hover:text-gold">
                  <Avatar name={t.assigneeName} size={24} /><span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className={`text-xs ${t.dueDate && t.dueDate < today ? "text-alert" : "text-muted"}`}>{t.dueDate ? formatDate(t.dueDate, { day: "numeric", month: "short" }) : "—"}</span>
                </Link></li>))}</ul>
            </Card>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-5">
            <SectionTitle title="Raccourcis" />
            <div className="grid grid-cols-2 gap-2">
              {shortcuts.map(({ label, href, Icon }) => (
                <Link key={href} href={href} className="touch-lg flex items-center gap-2.5 rounded-xl border border-line bg-night px-3 py-3 text-sm hover:border-gold hover:text-gold"><Icon className="size-4 shrink-0 text-gold" /><span className="leading-tight">{label}</span></Link>
              ))}
            </div>
          </Card>
          {can(user, "idees.voir") && (
            <Card className="p-5">
              <SectionTitle title="Les idées du jour" action={<Link href="/idees" className="text-xs text-gold">Ouvrir →</Link>} />
              {ideas.length ? ideas.map((i) => (
                <Link key={i.id} href={`/idees?idee=${i.id}`} className="mb-2 flex gap-3 rounded-xl border border-line p-3 last:mb-0 hover:border-gold">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-gold" /><span><span className="block text-sm font-medium">{i.title}</span><span className="line-clamp-2 text-xs text-muted">{i.description}</span></span>
                </Link>
              )) : <p className="text-sm text-muted">{isAiConfigured() ? "Les deux idées du jour n'ont pas encore été générées." : "Module en attente de configuration : aucune clé d'IA n'est configurée (Paramètres → Intégrations)."}</p>}
            </Card>
          )}
          <Card className="p-5">
            <SectionTitle title="Dans les coulisses" eyebrow="Activité de l'équipe" action={<Link href="/activite" className="text-xs text-gold">Fil complet →</Link>} />
            {others.length === 0 ? <EmptyState title="Calme plat">L&apos;activité de vos coéquipiers apparaîtra ici.</EmptyState> : (
              <ul className="flex flex-col gap-3">{others.map(({ a, name }) => (
                <li key={a.id} className="flex gap-3"><Avatar name={name} size={26} /><span className="min-w-0"><span className="block text-sm"><span className="font-medium">{name.split(" ")[0]}</span> · {a.summary}</span><span className="text-[11px] text-muted">{timeAgo(a.createdAt)}</span></span></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
      <Link href="/a-ne-pas-oublier" className="group flex items-center justify-between rounded-[14px] border border-line px-5 py-4 text-sm text-soft hover:border-gold">
        <span>{reminders.length} échéance{reminders.length > 1 ? "s" : ""} suivie{reminders.length > 1 ? "s" : ""} au total</span><ArrowRight className="size-4 text-gold transition group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
