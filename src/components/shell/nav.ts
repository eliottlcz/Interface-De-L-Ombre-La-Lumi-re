import type { Permission } from "@/lib/auth/permissions";
export type NavItem = { href: string; label: string; icon: string; perm?: Permission; highlight?: boolean };
export const NAV: NavItem[] = [
  { href: "/", label: "Vue d'ensemble", icon: "LayoutDashboard" },
  { href: "/statistiques", label: "Statistiques", icon: "ChartColumn", perm: "stats.voir" },
  { href: "/crm", label: "Invités & CRM", icon: "Users", perm: "crm.voir" },
  { href: "/production", label: "Production", icon: "Clapperboard", perm: "production.voir" },
  { href: "/calendrier", label: "Calendrier éditorial", icon: "CalendarDays", perm: "calendrier.voir" },
  { href: "/missions", label: "Mes missions", icon: "ListChecks", perm: "taches.voir" },
  { href: "/idees", label: "Idées du jour", icon: "Lightbulb", perm: "idees.voir" },
  { href: "/ressources", label: "Ressources", icon: "FolderOpen", perm: "ressources.voir" },
  { href: "/drive", label: "Google Drive", icon: "HardDrive", perm: "production.voir" },
  { href: "/checklists", label: "Checklists", icon: "ClipboardCheck", perm: "production.voir" },
  { href: "/finances", label: "Finances", icon: "Wallet", perm: "finances.voir" },
  { href: "/contenus", label: "Contenus", icon: "Film", perm: "production.voir" },
  { href: "/a-ne-pas-oublier", label: "À ne pas oublier", icon: "BellRing", highlight: true },
  { href: "/parametres", label: "Paramètres", icon: "Settings" },
];
