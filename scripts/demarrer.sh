#!/usr/bin/env bash
# Démarre tout le QG en une commande (Docker requis) et affiche les liens d'invitation.
#   bash scripts/demarrer.sh --eliott=adresse1@… --arthur=adresse2@…            # sur cet ordinateur : http://localhost:3000
#   bash scripts/demarrer.sh --public --eliott=… --arthur=…                      # + adresse https temporaire pour iPad / téléphone
set -euo pipefail
cd "$(dirname "$0")/.."
PUBLIC=0; ARGS=()
for a in "$@"; do [ "$a" = "--public" ] && PUBLIC=1 || ARGS+=("$a"); done
[ ${#ARGS[@]} -ge 1 ] || { echo "Indiquez au moins une adresse : --eliott=… --arthur=…"; exit 1; }
command -v docker >/dev/null || { echo "Docker est requis : https://docs.docker.com/get-docker/"; exit 1; }

# Secrets générés une seule fois et conservés (ne jamais les partager ni les committer)
if [ ! -f .env.docker ]; then
  umask 077
  { echo "DB_PASSWORD=$(openssl rand -hex 24)"
    echo "SESSION_SECRET=$(openssl rand -base64 32)"
    echo "VAULT_MASTER_KEY=$(openssl rand -base64 32)"
    echo "CRON_SECRET=$(openssl rand -hex 24)"; } > .env.docker
  echo "✓ Secrets créés dans .env.docker — SAUVEGARDEZ ce fichier (la clé du coffre-fort en dépend)."
fi
set -a; . ./.env.docker; set +a
export APP_URL="${APP_URL:-http://localhost:3000}"
DC="docker compose --env-file .env.docker"

if [ $PUBLIC = 1 ]; then
  $DC --profile public up -d --build db tunnel
  echo "… recherche de l'adresse https temporaire"
  for _ in $(seq 1 60); do
    URL=$($DC logs tunnel 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true); [ -n "${URL:-}" ] && break; sleep 2
  done
  [ -n "${URL:-}" ] || { echo "Adresse temporaire introuvable (voir : $DC logs tunnel)"; exit 1; }
  export APP_URL="$URL"
fi
$DC up -d --build app
echo "… attente de l'application"
for _ in $(seq 1 90); do curl -fs -o /dev/null "http://localhost:3000/connexion" && break; sleep 2; done
curl -fs -o /dev/null "http://localhost:3000/connexion" || { echo "L'application ne répond pas (voir : $DC logs app)"; exit 1; }
echo; echo "Liens d'invitation (usage unique, valables 7 jours — chacun choisit son mot de passe) :"
$DC exec -T -e APP_URL="$APP_URL" app npm run -s db:seed-users -- "${ARGS[@]}"
echo; echo "Application : $APP_URL"
[ $PUBLIC = 1 ] && echo "⚠ Adresse temporaire : elle change à chaque redémarrage du tunnel. L'accès reste réservé aux comptes invités."
echo "Arrêt : $DC down   (les données sont conservées ; ajoutez -v pour tout effacer)"
