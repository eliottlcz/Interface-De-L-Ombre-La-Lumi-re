# QG — De l'Ombre à la Lumière

Le quartier général numérique privé du média **De l'Ombre à la Lumière** : missions, CRM d'invités, production en 12 étapes, calendrier éditorial, contenus, checklists de tournage, documents administratifs, finances, statistiques, idées du jour, ressources, coffre-fort chiffré, Google Drive, notifications et journal d'activité.

Accès **sur invitation uniquement**. Utilisable sur ordinateur, iPad et smartphone avec les mêmes données, synchronisées en direct.

## Pile technique

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL (Supabase en production) · Drizzle ORM · Argon2id · AES-256-GCM.

## Démarrage local

```bash
npm install
cp .env.example .env            # puis renseignez au minimum DATABASE_URL, APP_URL, SESSION_SECRET, VAULT_MASTER_KEY
npm run db:migrate              # crée le schéma
npm run db:seed-users -- --eliott=eliott@exemple.fr --arthur=arthur@exemple.fr   # affiche 2 liens d'invitation
npm run dev                     # http://localhost:3000
```

Chaque personne ouvre son lien d'invitation (à usage unique, 7 jours) et choisit son mot de passe. Aucun mot de passe n'est jamais défini ni stocké en clair.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run build` / `npm start` | Construire / lancer en production |
| `npm run lint` | Vérification des types |
| `npm test` | Tests unitaires (permissions, chiffrement, mots de passe, exports, dates) |
| `npm run test:e2e` | Tests de bout en bout (navigateur, deux comptes, 4 formats d'écran) — voir `ARCHITECTURE.md` |
| `npm run db:migrate` | Appliquer les migrations |
| `npm run db:backup` | Sauvegarde complète → `backups/` |
| `npx tsx scripts/restore.ts fichier.json` | Restauration dans une base vide déjà migrée |

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — structure, sécurité, données, temps réel, tests
- [`DEPLOIEMENT.md`](DEPLOIEMENT.md) — hébergement, variables, connexions API, comptes, sauvegardes, maintenance
- `.env.example` — toutes les variables d'environnement

## Principes

- Aucune donnée fictive affichée comme réelle ; une intégration non configurée le dit clairement.
- Aucune fonctionnalité annoncée « connectée » tant qu'elle n'a pas été configurée et testée.
- Les droits sont vérifiés **côté serveur** à chaque action (et non dans l'interface seule).
- Les secrets ne quittent jamais le serveur.
