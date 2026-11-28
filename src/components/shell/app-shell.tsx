"use client";
import Image from "next/image";
import { Ago } from "@/components/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bell, Menu, Plus, Search, LayoutDashboard, ListChecks, Users, CalendarDays, LogOut, Settings, X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { SyncDot } from "./realtime";
import { GlobalSearch } from "./search";
import { Avatar, IconButton } from "@/components/ui";
import { timeAgo } from "@/lib/dates";
import { markNotificationsRead } from "@/actions/notifications";
import type { Permission } from "@/lib/auth/permissions";

export type ShellNotification = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
type Props = {
  user: { name: string; role: string; permissions: Permission[] };
  urgentCount: number;
  notifications: ShellNotification[];
  unread: number;
  children: React.ReactNode;
};

const QUICK = [
  { label: "Ajouter une tâche", href: "/missions?nouveau=1", perm: "taches.modifier" },
  { label: "Ajouter un invité", href: "/crm?nouveau=1", perm: "crm.modifier" },
  { label: "Créer un épisode", href: "/production?nouveau=1", perm: "production.modifier" },
  { label: "Programmer un tournage", href: "/calendrier?nouveau=tournage", perm: "calendrier.modifier" },
  { label: "Ajouter une publication", href: "/contenus?nouveau=1", perm: "production.modifier" },
  { label: "Ajouter une dépense", href: "/finances?nouveau=depense", perm: "finances.modifier" },
  { label: "Ajouter une ressource", href: "/ressources?nouveau=1", perm: "ressources.modifier" },
] as const;

export function AppShell({ user, urgentCount, notifications, unread, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [panel, setPanel] = useState<null | "notifs" | "quick" | "user">(null);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => setPanel(null), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const quick = QUICK.filter((q) => user.permissions.includes(q.perm as Permission));

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <Sidebar permissions={user.permissions} urgentCount={urgentCount} open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Barre supérieure */}
      <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:px-6">
          <IconButton label="Menu" className="lg:hidden" onClick={() => setMenuOpen(true)}><Menu className="size-5" /></IconButton>
          <Link href="/" className="lg:hidden md:hidden"><Image src="/brand/logo-tile.png" alt="Accueil" width={30} height={30} className="rounded" /></Link>
          <button onClick={() => setSearchOpen(true)}
            className="touch-lg flex h-10 flex-1 items-center gap-2 rounded-full border border-line bg-night px-4 text-left text-sm text-muted hover:border-line-strong md:max-w-md">
            <Search className="size-4" /><span className="flex-1 truncate">Rechercher…</span>
            <kbd className="hidden rounded border border-line px-1.5 text-[10px] md:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <SyncDot />
            {quick.length > 0 && (
              <div className="relative hidden md:block">
                <button onClick={() => setPanel(panel === "quick" ? null : "quick")} className="touch-lg ml-2 inline-flex h-10 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-semibold text-black hover:bg-[#e8d27a]">
                  <Plus className="size-4" /> Créer
                </button>
                {panel === "quick" && <QuickMenu items={quick} />}
              </div>
            )}
            <div className="relative">
              <IconButton label="Notifications" onClick={() => setPanel(panel === "notifs" ? null : "notifs")}>
                <Bell className="size-5" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-gold px-1 text-[10px] font-bold leading-4 text-black">{unread > 99 ? "99+" : unread}</span>}
              </IconButton>
              {panel === "notifs" && (
                <Dropdown className="w-[min(92vw,380px)]">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <span className="display text-xs">Notifications</span>
                    <div className="flex gap-3 text-xs">
                      {unread > 0 && <button className="text-gold" onClick={async () => { await markNotificationsRead(); router.refresh(); }}>Tout marquer lu</button>}
                      <Link href="/activite" className="text-muted hover:text-cream">Fil d&apos;activité</Link>
                    </div>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Aucune notification.</p>}
                    {notifications.map((n) => (
                      <button key={n.id} onClick={async () => { await markNotificationsRead([n.id]); setPanel(null); if (n.link) router.push(n.link); else router.refresh(); }}
                        className={clsx("flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-panel-2", !n.readAt && "bg-gold/[0.04]")}>
                        <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-gold")} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{n.title}</span>
                          {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                          <span className="block text-[11px] text-muted"><Ago value={n.createdAt} /></span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Dropdown>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setPanel(panel === "user" ? null : "user")} className="touch-lg ml-1 flex items-center gap-2 rounded-full p-1 hover:bg-panel-2" aria-label="Mon compte">
                <Avatar name={user.name} size={32} />
              </button>
              {panel === "user" && (
                <Dropdown className="w-60">
                  <div className="border-b border-line px-4 py-3">
                    <div className="font-semibold">{user.name}</div>
                    <div className="text-xs capitalize text-muted">{user.role}</div>
                  </div>
                  <Link href="/parametres" className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-panel-2"><Settings className="size-4" />Paramètres</Link>
                  <form method="post" action="/api/deconnexion"><button className="flex w-full items-center gap-2 px-4 py-3 text-sm text-alert hover:bg-panel-2"><LogOut className="size-4" />Se déconnecter</button></form>
                </Dropdown>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8">{children}</main>

      {/* Barre d'onglets smartphone */}
      <MobileTabBar quick={quick} onMenu={() => setMenuOpen(true)} permissions={user.permissions} />

      {panel && <div className="fixed inset-0 z-10" onClick={() => setPanel(null)} />}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function Dropdown({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("animate-in absolute right-0 top-12 z-30 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl", className)}>{children}</div>;
}
function QuickMenu({ items }: { items: readonly { label: string; href: string }[] }) {
  return (
    <Dropdown className="w-64 py-1">
      {items.map((q) => <Link key={q.href} href={q.href} className="block px-4 py-2.5 text-sm hover:bg-panel-2 hover:text-gold">{q.label}</Link>)}
    </Dropdown>
  );
}

function MobileTabBar({ quick, onMenu, permissions }: { quick: readonly { label: string; href: string }[]; onMenu: () => void; permissions: Permission[] }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  useEffect(() => setSheet(false), [pathname]);
  const tabs = [
    { href: "/", label: "Accueil", Icon: LayoutDashboard },
    { href: "/missions", label: "Missions", Icon: ListChecks, perm: "taches.voir" },
    { href: "/crm", label: "CRM", Icon: Users, perm: "crm.voir" },
    { href: "/calendrier", label: "Agenda", Icon: CalendarDays, perm: "calendrier.voir" },
  ].filter((t) => !t.perm || permissions.includes(t.perm as Permission));
  const isActive = (h: string) => (h === "/" ? pathname === "/" : pathname.startsWith(h));
  const menuActive = !tabs.some((t) => isActive(t.href));
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navigation principale">
        <div className="grid grid-cols-6 items-end">
          {tabs.slice(0, 2).map((t) => <Tab key={t.href} {...t} active={isActive(t.href)} />)}
          <div className="flex justify-center pb-2">
            {quick.length > 0 && (
              <button onClick={() => setSheet(true)} aria-label="Créer" className="-mt-5 flex size-14 items-center justify-center rounded-full bg-gold text-black shadow-[0_6px_24px_rgba(223,198,98,0.35)]">
                <Plus className="size-6" />
              </button>
            )}
          </div>
          {tabs.slice(2, 4).map((t) => <Tab key={t.href} {...t} active={isActive(t.href)} />)}
          {Array.from({ length: Math.max(0, 4 - tabs.length) }).map((_, i) => <span key={i} />)}
          <button onClick={onMenu} aria-label="Toutes les rubriques" className={clsx("flex flex-col items-center gap-0.5 py-2 text-[10px]", menuActive ? "text-gold" : "text-muted")}>
            <Menu className="size-5" />Menu
          </button>
        </div>
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:hidden" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div className="animate-in w-full rounded-t-2xl border-t border-line bg-panel pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="display text-sm">Créer</span>
              <IconButton label="Fermer" onClick={() => setSheet(false)}><X className="size-5" /></IconButton>
            </div>
            {quick.map((q) => <Link key={q.href} href={q.href} className="block border-t border-line px-5 py-4 text-[15px] active:bg-panel-2">{q.label}</Link>)}
          </div>
        </div>
      )}
    </>
  );
}
function Tab({ href, label, Icon, active }: { href: string; label: string; Icon: typeof Menu; active: boolean }) {
  return (
    <Link href={href} className={clsx("flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-gold" : "text-muted")}>
      <Icon className="size-5" />{label}
    </Link>
  );
}
