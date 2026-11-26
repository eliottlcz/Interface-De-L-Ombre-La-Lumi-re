"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { LayoutDashboard, ChartColumn, Users, Clapperboard, CalendarDays, ListChecks, Lightbulb, FolderOpen, HardDrive, ClipboardCheck, Wallet, Film, BellRing, Settings, type LucideIcon } from "lucide-react";
const ICONS: Record<string, LucideIcon> = { LayoutDashboard, ChartColumn, Users, Clapperboard, CalendarDays, ListChecks, Lightbulb, FolderOpen, HardDrive, ClipboardCheck, Wallet, Film, BellRing, Settings };
import { NAV } from "./nav";
import type { Permission } from "@/lib/auth/permissions";

export function Sidebar({ permissions, urgentCount, open, onClose }: { permissions: Permission[]; urgentCount: number; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = NAV.filter((n) => !n.perm || permissions.includes(n.perm));
  return (
    <>
      <div className={clsx("fixed inset-0 z-30 bg-black/60 lg:hidden", open ? "block" : "hidden")} onClick={onClose} />
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-ink transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full")}>
        <Link href="/" className="flex items-center gap-3 px-5 pt-6 pb-5">
          <Image src="/brand/logo-tile.png" alt="De l'Ombre à la Lumière" width={44} height={44} className="rounded-md" priority />
          <div className="leading-tight">
            <div className="display text-[13px]">Le QG</div>
            <div className="text-[11px] text-muted">De l&apos;Ombre à la Lumière</div>
          </div>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {items.map((n) => {
            const Icon = ICONS[n.icon];
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={clsx("group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition touch-lg",
                  active ? "bg-panel-2 text-cream" : "text-soft hover:text-cream hover:bg-panel")}>
                {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] -skew-x-12 bg-gold" />}
                <Icon className={clsx("size-[18px] shrink-0", active || n.highlight ? "text-gold" : "text-muted group-hover:text-soft")} />
                <span className="flex-1">{n.label}</span>
                {n.highlight && urgentCount > 0 && <span className="rounded-full bg-gold px-1.5 text-[11px] font-bold text-black">{urgentCount}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mx-5 mb-5 border-t border-line pt-4">
          <Image src="/brand/logo-inline.png" alt="" width={180} height={14} className="opacity-60" />
        </div>
      </aside>
    </>
  );
}
