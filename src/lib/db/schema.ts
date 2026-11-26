/**
 * Schéma de la base de données — De l'Ombre à la Lumière (QG)
 * PostgreSQL. Les migrations SQL sont générées dans /drizzle via `npm run db:generate`.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, varchar, timestamp, boolean, integer, bigint, jsonb,
  date, numeric, index, uniqueIndex, customType, check,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ───────────── Enums ───────────── */
export const roleEnum = pgEnum("role", ["administrateur", "producteur", "collaborateur", "lecteur"]);
export const taskStatusEnum = pgEnum("task_status", ["a_faire", "en_cours", "en_attente", "termine"]);
export const priorityEnum = pgEnum("priority", ["basse", "normale", "haute", "urgente"]);
export const contactCategoryEnum = pgEnum("contact_category", ["a_contacter", "mail_envoye", "a_relancer", "invite_recu"]);
export const interactionTypeEnum = pgEnum("interaction_type", ["mail_envoye", "relance", "reponse", "appel", "rendez_vous", "note", "changement_statut"]);
export const episodeStageEnum = pgEnum("episode_stage", [
  "identifie", "premier_contact", "interesse", "confirme", "preparation", "tournage_realise",
  "montage", "validation", "habillage", "programmation", "publication", "promotion_terminee",
]);
export const eventTypeEnum = pgEnum("event_type", [
  "prise_contact", "relance", "interview", "tournage", "montage", "validation",
  "pub_youtube", "pub_instagram", "pub_tiktok", "pub_podcast", "autre",
]);
export const contentKindEnum = pgEnum("content_kind", ["youtube_complet", "audio", "short", "reel", "tiktok", "teaser", "citation", "promo"]);
export const contentStatusEnum = pgEnum("content_status", ["a_produire", "en_montage", "a_valider", "programme", "publie"]);
export const guestDocKindEnum = pgEnum("guest_doc_kind", ["droit_image", "autorisation_diffusion", "production", "complementaire"]);
export const guestDocStatusEnum = pgEnum("guest_doc_status", ["manquant", "demande", "recu", "valide"]);
export const txTypeEnum = pgEnum("tx_type", ["depense", "recette"]);
export const txStatusEnum = pgEnum("tx_status", ["regle", "a_regler"]);
export const ideaStatusEnum = pgEnum("idea_status", ["nouvelle", "favori", "ignoree", "transformee"]);
export const resourceSectionEnum = pgEnum("resource_section", ["identite", "documents", "communication", "production"]);
export const metricSourceEnum = pgEnum("metric_source", ["api", "manuel"]);
export const authTokenTypeEnum = pgEnum("auth_token_type", ["invitation", "reinitialisation"]);

/* ───────────── Utilisateurs & sécurité ───────────── */
export const users = pgTable("users", {
  id: id(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  title: varchar("title", { length: 120 }),
  role: roleEnum("role").notNull().default("collaborateur"),
  /** Ajustements de permissions par utilisateur : { "finances.voir": true, "coffre.voir": false } */
  permissionOverrides: jsonb("permission_overrides").$type<Record<string, boolean>>().notNull().default({}),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const authTokens = pgTable("auth_tokens", {
  id: id(),
  type: authTokenTypeEnum("type").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 120 }),
  role: roleEnum("role"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Journal des connexions (réussies et échouées) — sert aussi à la limitation de tentatives. */
export const loginEvents = pgTable("login_events", {
  id: id(),
  email: varchar("email", { length: 320 }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  success: boolean("success").notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  reason: varchar("reason", { length: 80 }),
  createdAt: createdAt(),
}, (t) => [index("login_events_email_idx").on(t.email, t.createdAt), index("login_events_ip_idx").on(t.ip, t.createdAt)]);

/** Historique des actions (toutes les modifications + actions sensibles). */
export const auditLog = pgTable("audit_log", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 40 }),
  entityId: uuid("entity_id"),
  summary: text("summary").notNull(),
  sensitive: boolean("sensitive").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}, (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entityType, t.entityId)]);

/* ───────────── CRM ───────────── */
export type Socials = { instagram?: string; tiktok?: string; linkedin?: string; youtube?: string; x?: string; site?: string };

export const contacts = pgTable("contacts", {
  id: id(),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull().default(""),
  profession: varchar("profession", { length: 200 }),
  company: varchar("company", { length: 200 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 60 }),
  socials: jsonb("socials").$type<Socials>().notNull().default({}),
  category: contactCategoryEnum("category").notNull().default("a_contacter"),
  priority: priorityEnum("priority").notNull().default("normale"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  whyInteresting: text("why_interesting"),
  notes: text("notes"),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  lastEmailSubject: varchar("last_email_subject", { length: 300 }),
  responseReceived: boolean("response_received").notNull().default(false),
  followupCount: integer("followup_count").notNull().default(0),
  nextAction: text("next_action"),
  nextFollowupAt: date("next_followup_at"),
  shootDate: date("shoot_date"),
  publishDate: date("publish_date"),
  episodeUrl: text("episode_url"),
  driveFolderId: varchar("drive_folder_id", { length: 200 }),
  driveFolderUrl: text("drive_folder_url"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("contacts_email_unique").on(sql`lower(${t.email})`).where(sql`${t.email} is not null and ${t.email} <> ''`),
  index("contacts_category_idx").on(t.category),
]);

export const contactInteractions = pgTable("contact_interactions", {
  id: id(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  type: interactionTypeEnum("type").notNull(),
  subject: varchar("subject", { length: 300 }),
  body: text("body"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index("interactions_contact_idx").on(t.contactId, t.occurredAt)]);

/* ───────────── Production ───────────── */
export type PublicationLinks = { youtube?: string; spotify?: string; apple?: string; deezer?: string; instagram?: string; tiktok?: string; autre?: string };

export const episodes = pgTable("episodes", {
  id: id(),
  number: integer("number"),
  title: varchar("title", { length: 300 }).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  stage: episodeStageEnum("stage").notNull().default("identifie"),
  producerId: uuid("producer_id").references(() => users.id, { onDelete: "set null" }),
  shootDate: timestamp("shoot_date", { withTimezone: true }),
  shootLocation: varchar("shoot_location", { length: 300 }),
  prepNotes: text("prep_notes"),
  interviewQuestions: text("interview_questions"),
  videoUrl: text("video_url"),
  audioUrl: text("audio_url"),
  graphicsUrl: text("graphics_url"),
  adminDocsUrl: text("admin_docs_url"),
  plannedPublishDate: date("planned_publish_date"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publicationLinks: jsonb("publication_links").$type<PublicationLinks>().notNull().default({}),
  driveFolderId: varchar("drive_folder_id", { length: 200 }),
  driveFolderUrl: text("drive_folder_url"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("episodes_number_unique").on(t.number).where(sql`${t.number} is not null`)]);

/** Validation de chaque étape (qui / quand). */
export const episodeStages = pgTable("episode_stages", {
  id: id(),
  episodeId: uuid("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  stage: episodeStageEnum("stage").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [uniqueIndex("episode_stage_unique").on(t.episodeId, t.stage)]);

export const contents = pgTable("contents", {
  id: id(),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
  kind: contentKindEnum("kind").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  platform: varchar("platform", { length: 40 }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  status: contentStatusEnum("status").notNull().default("a_produire"),
  plannedDate: date("planned_date"),
  fileUrl: text("file_url"),
  publicationUrl: text("publication_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("contents_episode_idx").on(t.episodeId)]);

/* ───────────── Tâches ───────────── */
export const tasks = pgTable("tasks", {
  id: id(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  /** null = tâche commune */
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  priority: priorityEnum("priority").notNull().default("normale"),
  status: taskStatusEnum("status").notNull().default("a_faire"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  /** Clé d'automatisation pour éviter les doublons (ex. "ep:<id>:prep:questions"). */
  automationKey: varchar("automation_key", { length: 200 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("tasks_assignee_idx").on(t.assigneeId, t.status),
  uniqueIndex("tasks_automation_unique").on(t.automationKey).where(sql`${t.automationKey} is not null`),
]);

export const taskComments = pgTable("task_comments", {
  id: id(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

/* ───────────── Pièces jointes (stockage privé en base) ───────────── */
export const attachments = pgTable("attachments", {
  id: id(),
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  filename: varchar("filename", { length: 300 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }),
  size: integer("size"),
  /** Fichier stocké (≤ 15 Mo) — sinon `url` pointe vers Drive ou un lien externe. */
  data: bytea("data"),
  url: text("url"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("attachments_entity_idx").on(t.entityType, t.entityId)]);

/* ───────────── Calendrier ───────────── */
export const events = pgTable("events", {
  id: id(),
  title: varchar("title", { length: 300 }).notNull(),
  type: eventTypeEnum("type").notNull().default("autre"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  allDay: boolean("all_day").notNull().default(false),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  location: varchar("location", { length: 300 }),
  notes: text("notes"),
  automationKey: varchar("automation_key", { length: 200 }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("events_starts_idx").on(t.startsAt),
  uniqueIndex("events_automation_unique").on(t.automationKey).where(sql`${t.automationKey} is not null`),
]);

/* ───────────── Checklists ───────────── */
export const checklists = pgTable("checklists", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  phase: varchar("phase", { length: 20 }).notNull().default("avant"), // avant | apres | autre
  isTemplate: boolean("is_template").notNull().default(false),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  sourceTemplateId: uuid("source_template_id"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const checklistItems = pgTable("checklist_items", {
  id: id(),
  checklistId: uuid("checklist_id").notNull().references(() => checklists.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 300 }).notNull(),
  position: integer("position").notNull().default(0),
  done: boolean("done").notNull().default(false),
  doneBy: uuid("done_by").references(() => users.id, { onDelete: "set null" }),
  doneAt: timestamp("done_at", { withTimezone: true }),
});

/* ───────────── Documents administratifs invités ───────────── */
export const guestDocuments = pgTable("guest_documents", {
  id: id(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  kind: guestDocKindEnum("kind").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  status: guestDocStatusEnum("status").notNull().default("manquant"),
  proofAttachmentId: uuid("proof_attachment_id").references(() => attachments.id, { onDelete: "set null" }),
  proofUrl: text("proof_url"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  // Un document ne peut être « reçu » ou « validé » sans preuve.
  check("guest_doc_proof_required", sql`${t.status} not in ('recu','valide') or ${t.proofAttachmentId} is not null or (${t.proofUrl} is not null and ${t.proofUrl} <> '')`),
  check("guest_doc_validation_trace", sql`${t.status} <> 'valide' or (${t.validatedBy} is not null and ${t.validatedAt} is not null)`),
]);

/* ───────────── Finances ───────────── */
export const transactions = pgTable("transactions", {
  id: id(),
  type: txTypeEnum("type").notNull(),
  date: date("date").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  status: txStatusEnum("status").notNull().default("regle"),
  dueDate: date("due_date"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check("amount_positive", sql`${t.amountCents} > 0`), index("tx_date_idx").on(t.date)]);

/* ───────────── Idées du jour ───────────── */
export type IdeaSource = { title: string; url: string };
export const ideas = pgTable("ideas", {
  id: id(),
  day: date("day").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  category: varchar("category", { length: 60 }),
  description: text("description").notNull(),
  relevance: text("relevance").notNull(),
  interest: text("interest").notNull(),
  actions: jsonb("actions").$type<string[]>().notNull().default([]),
  sources: jsonb("sources").$type<IdeaSource[]>().notNull().default([]),
  status: ideaStatusEnum("status").notNull().default("nouvelle"),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  model: varchar("model", { length: 80 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("ideas_day_idx").on(t.day)]);

export const ideaRuns = pgTable("idea_runs", {
  id: id(),
  day: date("day").notNull(),
  status: varchar("status", { length: 20 }).notNull(), // succes | erreur | en_cours
  message: text("message"),
  triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/* ───────────── Ressources ───────────── */
export const resources = pgTable("resources", {
  id: id(),
  section: resourceSectionEnum("section").notNull(),
  category: varchar("category", { length: 80 }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  /** Contenu texte (modèles de mails, scripts…) */
  body: text("body"),
  url: text("url"),
  driveFileId: varchar("drive_file_id", { length: 200 }),
  restricted: boolean("restricted").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────── Coffre-fort ───────────── */
export const vaultItems = pgTable("vault_items", {
  id: id(),
  service: varchar("service", { length: 120 }).notNull(),
  category: varchar("category", { length: 40 }).notNull().default("autre"),
  label: varchar("label", { length: 200 }),
  username: varchar("username", { length: 320 }),
  url: text("url"),
  /** Secret chiffré AES-256-GCM : iv.tag.ciphertext (base64) */
  secretEnc: text("secret_enc").notNull(),
  notesEnc: text("notes_enc"),
  keyVersion: integer("key_version").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────── Intégrations & statistiques ───────────── */
export const integrations = pgTable("integrations", {
  id: id(),
  provider: varchar("provider", { length: 40 }).notNull().unique(), // google_drive | youtube | instagram | tiktok
  accountLabel: varchar("account_label", { length: 200 }),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: updatedAt(),
});

export const oauthStates = pgTable("oauth_states", {
  state: varchar("state", { length: 64 }).primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeVerifier: varchar("code_verifier", { length: 128 }),
  createdAt: createdAt(),
});

/** Série temporelle des indicateurs de compte (abonnés, vues, écoutes…). */
export const metricSnapshots = pgTable("metric_snapshots", {
  id: id(),
  platform: varchar("platform", { length: 30 }).notNull(),
  metric: varchar("metric", { length: 60 }).notNull(),
  day: date("day").notNull(),
  value: numeric("value", { precision: 20, scale: 4, mode: "number" }).notNull(),
  source: metricSourceEnum("source").notNull(),
  note: text("note"),
  enteredBy: uuid("entered_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("metric_unique").on(t.platform, t.metric, t.day, t.source), index("metric_lookup_idx").on(t.platform, t.metric, t.day)]);

/** Performances par contenu publié (vidéo, Reel, TikTok, épisode podcast). */
export const contentStats = pgTable("content_stats", {
  id: id(),
  platform: varchar("platform", { length: 30 }).notNull(),
  externalId: varchar("external_id", { length: 200 }).notNull(),
  kind: varchar("kind", { length: 30 }).notNull(),
  title: text("title"),
  url: text("url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
  source: metricSourceEnum("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("content_stats_unique").on(t.platform, t.externalId)]);

export const syncRuns = pgTable("sync_runs", {
  id: id(),
  provider: varchar("provider", { length: 40 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(), // succes | erreur
  message: text("message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/* ───────────── Notifications ───────────── */
export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  body: text("body"),
  link: text("link"),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  dedupeKey: varchar("dedupe_key", { length: 200 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("notif_user_idx").on(t.userId, t.readAt),
  uniqueIndex("notif_dedupe_unique").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
]);

/** Paramètres applicatifs clé/valeur (ex. : identifiants publics des plateformes). */
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});
