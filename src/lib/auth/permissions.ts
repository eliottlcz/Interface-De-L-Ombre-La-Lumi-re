/**
 * Contrôle d'accès : rôles → permissions, avec ajustements par utilisateur.
 * Ce module est pur (pas d'accès DB) : il est utilisé côté serveur pour toutes
 * les vérifications, et côté client uniquement pour masquer des éléments d'interface.
 */
export const PERMISSIONS = {
  "utilisateurs.gerer": "Inviter, modifier et désactiver des utilisateurs",
  "permissions.gerer": "Modifier les rôles et permissions",
  "integrations.gerer": "Connecter / configurer les intégrations (Drive, plateformes, IA)",
  "journal.voir": "Consulter le journal des actions et des connexions",
  "exports.faire": "Exporter les données (CSV / Excel) et sauvegardes",
  "crm.voir": "Consulter le CRM",
  "crm.modifier": "Créer et modifier des contacts",
  "crm.supprimer": "Supprimer définitivement des contacts",
  "production.voir": "Consulter la production et les contenus",
  "production.modifier": "Créer et modifier épisodes, contenus, checklists, documents invités",
  "production.supprimer": "Supprimer des épisodes",
  "taches.voir": "Consulter les tâches",
  "taches.modifier": "Créer, modifier, attribuer des tâches",
  "taches.supprimer_toutes": "Supprimer n'importe quelle tâche (sinon : seulement celles qu'on a créées)",
  "calendrier.voir": "Consulter le calendrier",
  "calendrier.modifier": "Créer et déplacer des événements",
  "ressources.voir": "Consulter les ressources",
  "ressources.modifier": "Ajouter et modifier des ressources",
  "ressources.restreintes": "Accéder aux ressources restreintes (contrats, documents administratifs)",
  "stats.voir": "Consulter les statistiques",
  "stats.saisir": "Saisir des statistiques manuellement",
  "finances.voir": "Consulter les finances",
  "finances.modifier": "Saisir et modifier des opérations financières",
  "idees.voir": "Consulter les idées du jour",
  "idees.generer": "Lancer une génération d'idées",
  "coffre.voir": "Accéder au coffre-fort et révéler des identifiants",
  "coffre.modifier": "Ajouter / modifier des identifiants du coffre-fort",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type Role = "administrateur" | "producteur" | "collaborateur" | "lecteur";

export const ROLE_LABELS: Record<Role, string> = {
  administrateur: "Administrateur",
  producteur: "Producteur",
  collaborateur: "Collaborateur",
  lecteur: "Lecteur",
};

const ALL = Object.keys(PERMISSIONS) as Permission[];
const VIEW: Permission[] = ["crm.voir", "production.voir", "taches.voir", "calendrier.voir", "ressources.voir", "stats.voir", "idees.voir"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  administrateur: ALL,
  producteur: ALL.filter((p) => !["utilisateurs.gerer", "permissions.gerer"].includes(p)),
  collaborateur: [
    ...VIEW,
    "crm.modifier", "production.modifier", "taches.modifier", "calendrier.modifier",
    "ressources.modifier", "stats.saisir", "idees.generer",
  ],
  lecteur: VIEW,
};

export type PermissionSubject = { role: Role; permissionOverrides?: Record<string, boolean> | null };

export function effectivePermissions(u: PermissionSubject): Set<Permission> {
  const set = new Set<Permission>(ROLE_PERMISSIONS[u.role] ?? []);
  for (const [k, v] of Object.entries(u.permissionOverrides ?? {})) {
    if (!(k in PERMISSIONS)) continue;
    if (v) set.add(k as Permission); else set.delete(k as Permission);
  }
  return set;
}

export function can(u: PermissionSubject | null | undefined, p: Permission): boolean {
  if (!u) return false;
  return effectivePermissions(u).has(p);
}
