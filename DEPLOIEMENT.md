# Déploiement

Cible recommandée : **Vercel** (application) + **Supabase** (PostgreSQL). Tout autre hébergeur Node + PostgreSQL convient.

## 1. Base de données (Supabase)

1. Créer un projet Supabase (région Europe).
2. *Project Settings → Database* : relever
   - la chaîne **Transaction pooler** (port 6543) → `DATABASE_URL` (avec `DATABASE_PREPARE=false`) ;
   - la chaîne **Direct connection** ou **Session pooler** (port 5432) → `DATABASE_URL_DIRECT`.
3. Appliquer le schéma depuis votre poste : `DATABASE_URL="<chaîne directe>" npm run db:migrate`.
4. Les migrations activent la sécurité par ligne (RLS) sans politique : l'API publique de Supabase n'a donc aucun accès aux tables. L'application s'y connecte avec sa propre chaîne de connexion.

## 2. Secrets à générer

```bash
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # VAULT_MASTER_KEY  (32 octets exactement)
openssl rand -base64 32   # CRON_SECRET
```

**Conservez `VAULT_MASTER_KEY` dans un gestionnaire de mots de passe, séparément de la base.** Sans elle, le coffre-fort et les jetons OAuth sont définitivement illisibles.

## 3. Application (Vercel)

1. Importer le dépôt, framework Next.js détecté.
2. Renseigner les variables de `.env.example` (*Settings → Environment Variables*), dont `APP_URL` = adresse publique définitive.
3. Déployer. Le fichier `vercel.json` planifie `/api/cron/quotidien` chaque jour ; Vercel envoie automatiquement `Authorization: Bearer <CRON_SECRET>`.
4. Domaine personnalisé conseillé (HTTPS obligatoire : le cookie de session est `Secure`).

**Temps réel sur Vercel** : le flux SSE est limité à 60 s par connexion ; le navigateur se reconnecte et se resynchronise automatiquement (aucune perte). Pour un flux continu, hébergez sur un serveur Node classique (`npm run build && npm start`) derrière un proxy qui n'impose pas de coupure aux flux HTTP.

## 4. Création des comptes

```bash
DATABASE_URL="<chaîne directe>" APP_URL="https://qg.exemple.fr" \
  npm run db:seed-users -- --eliott=adresse1@… --arthur=adresse2@…
```

Le script affiche **deux liens à usage unique** (7 jours). Transmettez chacun à la bonne personne ; elle choisit son mot de passe. Eliott est administrateur, Arthur collaborateur.
Pour ajouter quelqu'un plus tard : *Paramètres → Équipe & permissions* (choix du rôle, droits ajustables).
Mot de passe oublié : « Mot de passe oublié » sur la page de connexion, ou lien de réinitialisation généré par un administrateur.

## 5. Connexions aux plateformes (toutes optionnelles)

Dans chaque cas : créer l'application chez la plateforme, déclarer l'URL de retour, saisir les identifiants dans les variables d'environnement, redéployer, puis cliquer sur **Connecter** dans l'application. L'état n'est « Connecté » qu'après un échange réussi.

| Service | Variables | URL de retour à déclarer |
|---|---|---|
| Google Drive | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `APP_URL/api/integrations/callback/google_drive` |
| YouTube | mêmes identifiants Google (API YouTube Data + Analytics activées) | `APP_URL/api/integrations/callback/youtube` |
| Instagram | `META_APP_ID`, `META_APP_SECRET` (compte professionnel relié à une Page) | `APP_URL/api/integrations/callback/instagram` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `APP_URL/api/integrations/callback/tiktok` |
| Podcasts (Spotify, Apple, Deezer) | aucune | Saisie manuelle, signalée comme telle |

Les vidéos lourdes restent sur Google Drive : l'application ne stocke que les liens. Les pièces jointes directes sont limitées à 15 Mo.

Idées du jour : renseigner `ANTHROPIC_API_KEY`. Sans clé, la page indique « configuration manquante ». E-mails : `RESEND_API_KEY` et `MAIL_FROM` (sans eux, les liens d'invitation s'affichent à l'administrateur pour envoi manuel).

## 6. Sauvegardes

- **Depuis l'application** : *Paramètres → Exports & sauvegardes* (JSON) ; exports CSV / Excel par rubrique.
- **En ligne de commande** : `npm run db:backup` → `backups/dlal-AAAA-MM-JJ.json` (à planifier chaque semaine et à copier hors du serveur).
- **Supabase** : activer les sauvegardes quotidiennes du projet (plan Pro) en complément.
- Les secrets du coffre-fort restent chiffrés dans les sauvegardes ; la restauration exige la même `VAULT_MASTER_KEY`.

**Restauration** (base vide) : `npm run db:migrate` puis `npx tsx scripts/restore.ts backups/dlal-….json`. Le script refuse une base non vide (sauf `--force`).
Un test automatique vérifie la chaîne complète : sauvegarde téléchargée → base vide → mêmes volumes, mêmes fichiers joints, mêmes secrets chiffrés.

## 7. Maintenance

- Mises à jour : `npm update`, `npm run lint && npm test`, déploiement. Après un changement de schéma : `npm run db:migrate`.
- Rotation du mot de passe d'un compte : *Paramètres → Équipe & permissions* (ferme ses sessions).
- Compte perdu ou départ : *Désactiver* (les sessions se ferment immédiatement, l'historique est conservé).
- Journal : *Paramètres → Journal & sécurité* (administrateurs) ; il est immuable.
- Changer `VAULT_MASTER_KEY` rend illisibles les secrets existants : ne le faites pas sans les avoir ré-enregistrés.

## 8. Ce qui reste à valider chez vous

Ces points dépendent de comptes que seul le propriétaire peut créer ; ils n'ont donc **pas** pu être testés en conditions réelles :
connexions OAuth Google / Meta / TikTok, envoi d'e-mails (Resend), génération des idées (clé Anthropic), cron planifié sur Vercel. Chacun affiche son état réel dans *Paramètres → Intégrations* : à vérifier après configuration.

## 9. Lancement en une commande (Docker)

Pour essayer l'application sans hébergeur, sur un ordinateur ou un petit serveur avec Docker :

```bash
bash scripts/demarrer.sh --eliott=adresse1@… --arthur=adresse2@…            # http://localhost:3000
bash scripts/demarrer.sh --public --eliott=… --arthur=…                      # + adresse https temporaire (iPad, téléphone)
```

Le script crée les secrets (`.env.docker`, à sauvegarder), lance PostgreSQL et l'application, applique les migrations et affiche les deux liens d'invitation à usage unique. Avec `--public`, un tunnel Cloudflare fournit une adresse `https://….trycloudflare.com` temporaire : l'accès reste réservé aux comptes invités, mais l'adresse change à chaque redémarrage du tunnel. Pour un usage durable, préférez les sections 1 à 4.
Safari refuse les cookies sécurisés en `http://localhost` : utilisez Chrome/Firefox en local, ou l'option `--public` pour Safari et iPad.

## 10. Mise en ligne depuis un iPad / un téléphone (sans terminal)

1. Supabase : créer le projet, relever la chaîne **Transaction pooler** (`DATABASE_URL`, avec `DATABASE_PREPARE=false`) et la chaîne **Session pooler** (port 5432, compatible IPv4) pour `DATABASE_URL_DIRECT`.
2. Vercel : importer le dépôt (branche de production), saisir les variables de `.env.example`. Le déploiement applique tout seul les migrations (`vercel-build`).
3. Ouvrir une fois, dans Safari : `APP_URL/api/amorcage?cle=<CRON_SECRET>&eliott=<mail>&arthur=<mail>` → affiche les deux liens d'invitation. Cette adresse est refusée sans la clé, et se désactive dès qu'un compte existe.
