/** Libellés français et codes couleur — partagés client / serveur. */
export const TASK_STATUS = { a_faire: "À faire", en_cours: "En cours", en_attente: "En attente", termine: "Terminé" } as const;
export const PRIORITY = { basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente" } as const;
export const PRIORITY_RANK = { urgente: 0, haute: 1, normale: 2, basse: 3 } as const;

export const CONTACT_CATEGORY = {
  a_contacter: "À contacter", mail_envoye: "Mail envoyé", a_relancer: "À relancer", invite_recu: "Invités reçus",
} as const;
export const CONTACT_CATEGORY_ORDER = ["a_contacter", "mail_envoye", "a_relancer", "invite_recu"] as const;

export const INTERACTION_TYPE = {
  mail_envoye: "Mail envoyé", relance: "Relance", reponse: "Réponse reçue", appel: "Appel",
  rendez_vous: "Rendez-vous", note: "Note", changement_statut: "Changement de catégorie",
} as const;

export const EPISODE_STAGES = [
  ["identifie", "Invité identifié"],
  ["premier_contact", "Premier contact envoyé"],
  ["interesse", "Invité intéressé"],
  ["confirme", "Interview confirmée"],
  ["preparation", "Préparation de l'interview"],
  ["tournage_realise", "Tournage réalisé"],
  ["montage", "Montage en cours"],
  ["validation", "Validation"],
  ["habillage", "Miniature et habillage"],
  ["programmation", "Programmation"],
  ["publication", "Publication"],
  ["promotion_terminee", "Promotion terminée"],
] as const;
export type EpisodeStage = (typeof EPISODE_STAGES)[number][0];
export const EPISODE_STAGE: Record<EpisodeStage, string> = Object.fromEntries(EPISODE_STAGES) as Record<EpisodeStage, string>;
export const stageIndex = (s: EpisodeStage) => EPISODE_STAGES.findIndex(([k]) => k === s);

export const EVENT_TYPE = {
  prise_contact: "Prise de contact", relance: "Relance", interview: "Interview", tournage: "Tournage",
  montage: "Montage", validation: "Validation", pub_youtube: "Publication YouTube",
  pub_instagram: "Publication Instagram", pub_tiktok: "Publication TikTok", pub_podcast: "Publication podcast", autre: "Autre",
} as const;
/** Couleurs des événements : déclinaisons de la charte (or, crème, gris, olive) — pas de couleurs arbitraires. */
export const EVENT_COLOR: Record<keyof typeof EVENT_TYPE, string> = {
  prise_contact: "#8F8A80", relance: "#A79449", interview: "#F5F4F0", tournage: "#DFC662",
  montage: "#594F27", validation: "#C9B04F", pub_youtube: "#DFC662", pub_instagram: "#DFC662",
  pub_tiktok: "#DFC662", pub_podcast: "#DFC662", autre: "#5c5850",
};

export const CONTENT_KIND = {
  youtube_complet: "Épisode complet YouTube", audio: "Épisode audio", short: "YouTube Short", reel: "Instagram Reel",
  tiktok: "TikTok", teaser: "Teaser", citation: "Citation", promo: "Publication promotionnelle",
} as const;
export const CONTENT_KIND_PLATFORM: Record<keyof typeof CONTENT_KIND, string> = {
  youtube_complet: "YouTube", audio: "Podcast", short: "YouTube", reel: "Instagram", tiktok: "TikTok",
  teaser: "Multi-plateforme", citation: "Instagram", promo: "Multi-plateforme",
};
export const CONTENT_STATUS = { a_produire: "À produire", en_montage: "En montage", a_valider: "À valider", programme: "Programmé", publie: "Publié" } as const;

export const GUEST_DOC_KIND = {
  droit_image: "Autorisation de droit à l'image", autorisation_diffusion: "Autorisation de diffusion",
  production: "Document de production", complementaire: "Document complémentaire",
} as const;
export const GUEST_DOC_STATUS = { manquant: "Manquant", demande: "Demandé", recu: "Reçu", valide: "Validé" } as const;

export const TX_CATEGORIES = {
  abonnement: "Abonnements logiciels", studio: "Frais de studio", materiel: "Matériel", deplacement: "Déplacements",
  prestataire: "Prestataires", communication: "Communication", autre_depense: "Autre dépense",
  sponsoring: "Partenariat / sponsoring", subvention: "Subvention", vente: "Vente / prestation", autre_recette: "Autre recette",
} as const;
export const EXPENSE_CATEGORIES = ["abonnement", "studio", "materiel", "deplacement", "prestataire", "communication", "autre_depense"] as const;
export const INCOME_CATEGORIES = ["sponsoring", "subvention", "vente", "autre_recette"] as const;

export const RESOURCE_SECTION = {
  identite: "Identité visuelle", documents: "Documents", communication: "Communication", production: "Production",
} as const;
export const RESOURCE_CATEGORIES: Record<keyof typeof RESOURCE_SECTION, string[]> = {
  identite: ["Logo", "Charte graphique", "Couleurs", "Typographies", "Templates", "Miniatures", "Éléments graphiques"],
  documents: ["Média kit", "Présentation du média", "Documents administratifs", "Contrats", "Autorisations"],
  communication: ["Mail type", "Mail de prospection", "Mail de relance", "Mail de refus", "Message Instagram", "Script de contact"],
  production: ["Checklist", "Informations studio", "Matériel", "Processus de montage", "Calendrier éditorial"],
};

export const VAULT_CATEGORIES = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", spotify: "Spotify", apple: "Apple Podcasts",
  email: "Adresse e-mail", hebergement: "Hébergement", logiciel: "Logiciel", autre: "Autre service",
} as const;

export const PLATFORMS = {
  youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", spotify: "Spotify for Creators",
  apple: "Apple Podcasts", deezer: "Deezer", autre_podcast: "Autre plateforme podcast",
} as const;
export type PlatformKey = keyof typeof PLATFORMS;

/** Indicateurs suivis par plateforme. `api` = récupérable par l'API officielle une fois connectée. */
export const PLATFORM_METRICS: Record<PlatformKey, { key: string; label: string; api: boolean }[]> = {
  youtube: [
    { key: "abonnes", label: "Abonnés", api: true }, { key: "vues", label: "Vues cumulées", api: true },
    { key: "videos", label: "Vidéos publiées", api: true }, { key: "heures_visionnage", label: "Heures de visionnage", api: true },
    { key: "duree_moyenne_s", label: "Durée moyenne de visionnage (s)", api: true },
    { key: "ctr_miniatures", label: "Taux de clics des miniatures (%)", api: false },
  ],
  instagram: [
    { key: "abonnes", label: "Abonnés", api: true }, { key: "portee", label: "Portée", api: true },
    { key: "impressions", label: "Impressions", api: false }, { key: "vues", label: "Vues", api: true },
    { key: "interactions", label: "Interactions", api: true }, { key: "publications", label: "Publications", api: true },
  ],
  tiktok: [
    { key: "abonnes", label: "Abonnés", api: true }, { key: "likes", label: "Likes cumulés", api: true },
    { key: "videos", label: "Vidéos publiées", api: true }, { key: "vues", label: "Vues", api: true },
    { key: "commentaires", label: "Commentaires", api: true }, { key: "partages", label: "Partages", api: true },
  ],
  spotify: [
    { key: "streams", label: "Streams", api: false }, { key: "auditeurs", label: "Auditeurs uniques", api: false },
    { key: "abonnes", label: "Abonnés (followers)", api: false }, { key: "duree_ecoute_min", label: "Durée d'écoute (min)", api: false },
  ],
  apple: [
    { key: "ecoutes", label: "Écoutes", api: false }, { key: "auditeurs", label: "Auditeurs", api: false },
    { key: "abonnes", label: "Abonnés", api: false }, { key: "duree_ecoute_min", label: "Durée d'écoute (min)", api: false },
  ],
  deezer: [{ key: "ecoutes", label: "Écoutes", api: false }, { key: "fans", label: "Fans", api: false }],
  autre_podcast: [{ key: "ecoutes", label: "Écoutes", api: false }],
};
