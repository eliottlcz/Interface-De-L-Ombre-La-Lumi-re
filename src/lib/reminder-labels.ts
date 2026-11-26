/** Libellés et types des échéances — partagés client / serveur. */
export type ReminderKind =
  | "a_contacter" | "relance" | "reponse_attente" | "tournage" | "preparation" | "montage"
  | "validation" | "publication" | "autorisation" | "tache_retard" | "tache_echeance" | "finance";

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  a_contacter: "Invités à contacter", relance: "Relances", reponse_attente: "Réponses en attente",
  tournage: "Tournages à venir", preparation: "Préparations incomplètes", montage: "Montages en attente",
  validation: "À valider", publication: "Publications à programmer", autorisation: "Autorisations manquantes",
  tache_retard: "Tâches en retard", tache_echeance: "Échéances de tâches", finance: "Échéances financières",
};

export type Urgency = "retard" | "aujourdhui" | "semaine" | "plus_tard" | "sans_date";
export type Reminder = {
  key: string; kind: ReminderKind; title: string; detail?: string; date: string | null;
  ownerId: string | null; href: string; urgency: Urgency;
};

