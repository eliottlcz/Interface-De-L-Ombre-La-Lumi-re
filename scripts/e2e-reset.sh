#!/usr/bin/env bash
# Remet à zéro l'environnement de vérification : base vierge, comptes en attente d'invitation, serveur de production.
# Usage : bash scripts/e2e-reset.sh [--no-build]
set -euo pipefail
cd "$(dirname "$0")/.."
LOG="${E2E_LOG:-/tmp/dlal-e2e-server.log}"
pkill -f "next-server" 2>/dev/null || true; pkill -f "next start" 2>/dev/null || true; sleep 1
su postgres -c "psql -q -c 'drop database if exists dlal_verif with (force)'"
su postgres -c "createdb -O dlal dlal_verif"
if [ ! -f .env.verif ]; then
cat > .env.verif <<EOT
DATABASE_URL=postgres://dlal:dlal_local_dev@localhost:5432/dlal_verif
APP_URL=http://localhost:3100
SESSION_SECRET=$(openssl rand -base64 32)
VAULT_MASTER_KEY=$(openssl rand -base64 32)
CRON_SECRET=verif-cron-secret-0123456789
EOT
fi
set -a; . ./.env.verif; set +a
npm run -s db:migrate >/dev/null
OUT=$(npm run -s db:seed-users -- --eliott=eliott@test.local --arthur=arthur@test.local)
E=$(echo "$OUT" | grep "Eliott" | grep -o 'http[^ ]*'); A=$(echo "$OUT" | grep "Arthur" | grep -o 'http[^ ]*')
printf '{"eliott":"%s","arthur":"%s"}' "$E" "$A" > e2e/.invites.json
[ "${1:-}" = "--no-build" ] || NODE_ENV=production npx next build >/dev/null 2>&1
(NODE_ENV=production nohup npx next start -p 3100 > "$LOG" 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3100/connexion && break; sleep 1; done
echo "✓ Environnement de vérification prêt (http://localhost:3100)"
