#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$(id -u)" -ne 0 ]; then
  echo "Execute: sudo sh deploy/setup.sh"
  exit 1
fi
docker compose version >/dev/null
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "Preencha DOMAIN e ACME_EMAIL em .env e execute novamente."
  exit 1
fi
docker compose config --quiet
mkdir -p data backups secrets
chmod 700 data backups secrets
chmod 600 .env
docker compose build --pull app
docker run --rm --network none --user 0:0 \
  --mount "type=bind,src=$(pwd)/secrets,dst=/secrets" \
  persona:local node scripts/init-accounts.js /secrets/accounts.json
chown -R 1000:1000 data backups secrets
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose up -d --wait --wait-timeout 180
docker compose ps
echo "Persona iniciado. Acesse o domínio HTTPS configurado em .env."
