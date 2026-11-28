# Architecture

## Vue d'ensemble

```
Navigateur (PWA)  ──►  Next.js (Vercel ou Node)  ──►  PostgreSQL (Supabase)
   ▲                     ├─ pages (composants serveur)        ▲
   │  SSE /api/realtime  ├─ actions serveur (src/actions)     │ LISTEN/NOTIFY
   └─────────────────────┴─ routes API (exports, cron, OAuth) ┘
```

- **Pages** : composants serveur qui lisent la base puis passent des données sérialisées aux composants clients (`*-view.tsx`).
- **Écritures** : uniquement par **actions serveur** (`src/actions/*`). Chacune commence par `assertPermission(...)`, valide ses entrées (zod), écrit, journalise (`audit`), notifie et publie un événement temps réel.
- **Données** : `src/lib/db/schema.ts` (Drizzle) ; migrations dans `drizzle/` (dont RLS, journal immuable, déclencheurs `pg_notify`).

## Sécurité

| Sujet | Mise en œuvre |
|---|---|
| Accès | Invitation seulement ; jeton SHA-256 haché en base, usage unique, expiration |
| Mots de passe | Argon2id, politique 10 caractères + lettre + chiffre ; jamais en clair ni dans les journaux |
| Session | Cookie `dlal_session` HttpOnly, SameSite=Lax, Secure en production ; jeton haché en base ; désactiver un compte ferme ses sessions |
| Force brute | 5 échecs / e-mail ou 25 / IP par 15 min → blocage temporaire ; tentatives journalisées |
| Droits | Rôles administrateur / producteur / collaborateur / lecteur + dérogations par personne (`src/lib/auth/permissions.ts`), vérifiés côté serveur sur chaque action et chaque route |
| Base | RLS activée sur toutes les tables sans politique (aucun accès direct via l'API publique de Supabase) ; journal `audit_log` en écriture seule (déclencheur) ; contraintes CHECK (preuve obligatoire pour « signé », montants positifs) |
| Coffre-fort | AES-256-GCM, clé `VAULT_MASTER_KEY`, contexte authentifié par entrée ; déverrouillage par ressaisie du mot de passe (10 min) ; révélation masquée automatiquement après 20 s ; chaque consultation est journalisée ; le secret n'est **jamais** envoyé à la page |
| Jetons OAuth | Chiffrés avec la même clé ; PKCE pour Google |
| Exports | CSV/Excel : neutralisation de l'injection de formules ; réservés aux personnes autorisées |
| En-têtes | CSP, X-Frame-Options, Referrer-Policy… (`next.config.ts`) ; contrôle d'origine des actions serveur |

## Synchronisation entre appareils

Chaque modification de donnée incrémente un compteur en base (séquence `dlal_change_seq`, via les déclencheurs de la migration 0003). Chaque appareil ouvert consulte `/api/sync` (réponse minuscule, réservée aux connectés) toutes les 4 secondes tant que l'onglet est visible ; si le compteur a changé, les données sont rafraîchies (puis une seconde fois 1,8 s plus tard par sécurité). Vérification immédiate au retour sur l'onglet et à la reprise du réseau. Si le serveur ne répond pas, l'indicateur passe à « Liaison de secours » et la consultation continue.
Ce choix remplace un flux SSE permanent, inadapté à l'hébergement serverless (coût en temps de calcul, coupures sur réseaux publics, connexions de base immobilisées).

## Connexion et sessions

La connexion et la déconnexion sont des **formulaires HTML classiques** (`POST /api/connexion`, `POST /api/deconnexion`, réponse 303) : elles fonctionnent sans JavaScript et sur réseau dégradé, avec contrôle d'origine. La session est un jeton aléatoire haché en base, cookie `dlal_session` persistant 30 jours (HttpOnly, SameSite=Lax, Secure). Les erreurs reviennent par un cookie éphémère de 60 s (l'e-mail est conservé, jamais le mot de passe).

## Automatisations (`src/lib/automations.ts`)

Chaque création automatique porte une clé unique (`automationKey`) : un même déclencheur répété ne produit jamais de doublon.

- Invité confirmé → épisode, 4 tâches, checklist « Avant tournage », 2 documents d'invité, événement, dossier Drive (si connecté).
- Tournage réalisé → étape montage, tâches, checklist « Après tournage », 8 déclinaisons de contenu, validation.
- Publication → fiche invité mise à jour, tâches de statistiques J+7 / J+30, tâche de promotion.
- Tous les jours (`/api/cron/quotidien`) → rappels d'échéances et de relances, idées du jour.

Les actions irréversibles demandent une confirmation.

## Intégrations

Chaque connecteur est indépendant et affiche son état réel (`Non configuré` → `Non connecté` → `Connecté`) : Google Drive, YouTube, Instagram (Meta Graph), TikTok. Les statistiques sans API fiable (podcasts) se saisissent à la main et sont **étiquetées « saisie manuelle »**. Aucune statistique n'est inventée.

## Tests

- `npm test` — 22 tests unitaires (`tests/`).
- `npm run test:e2e` — 110 tests Playwright (dont la suite 10 : robustesse — sans JavaScript, réseau lent, coupure et reprise, fermeture du navigateur, deux appareils) (`e2e/`) : authentification, droits, synchronisation à deux comptes, CRM, production, calendrier/finances, statistiques/idées/ressources, 4 formats d'écran, sécurité (chiffrement vérifié en base, rejeu d'actions interdites, XSS/SQL, cookies, administration, sauvegarde → restauration).
  Préparation : `bash scripts/e2e-reset.sh` (base `dlal_verif` jetable, comptes d'essai, serveur de production sur le port 3100), puis `set -a; . ./.env.verif; set +a; npx playwright test --trace off`. Ne jamais pointer ces tests vers la base de production.

## Responsive

Trois gabarits réels (pas un bureau rétréci) : barre d'onglets + feuille « + » sur téléphone, cartes à la place des tableaux, vue agenda, déplacement par menu en plus du glisser-déposer, cibles tactiles ≥ 44 px sur écran tactile.
