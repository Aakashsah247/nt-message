#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker Engine with Compose is required." >&2
  exit 1
fi

if [[ ! -f .env.staging ]]; then
  echo "ERROR: .env.staging is missing." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yaml)

# `docker compose up -d` starts containers asynchronously. Wait until PostgreSQL
# accepts connections before taking the pre-migration backup.
ready=0
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T postgres \
    sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "ERROR: PostgreSQL did not become ready for backup." >&2
  exit 1
fi

mkdir -p deploy-backups
chmod 700 deploy-backups

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="deploy-backups/nt-message-staging-${STAMP}.dump"

"${COMPOSE[@]}" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$OUT"

chmod 600 "$OUT"
echo "Staging database backup created: $OUT"
