#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker Engine with Compose is required on the staging host." >&2
  exit 1
fi

if [[ ! -f .env.staging ]]; then
  echo "ERROR: .env.staging is missing. Copy deploy/.env.staging.example and fill it first." >&2
  exit 1
fi

if grep -Eq 'REPLACE_WITH|replace_with|example\.ntc\.net\.np' .env.staging; then
  echo "ERROR: .env.staging still contains deployment placeholders. Fill real staging values first." >&2
  exit 1
fi

mkdir -p deploy-data/attachments deploy-data/profile-photos deploy-data/group-photos
chmod 700 deploy-data deploy-data/attachments deploy-data/profile-photos deploy-data/group-photos

# Match the API process to the deployment user so bind-mounted NTC-managed
# storage stays writable without running the application as root.
export NT_MESSAGE_UID="${NT_MESSAGE_UID:-$(id -u)}"
export NT_MESSAGE_GID="${NT_MESSAGE_GID:-$(id -g)}"

COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yaml)

# Build first. If this fails, the currently running staging containers remain untouched.
"${COMPOSE[@]}" build

# Start persistent infrastructure first. ClamAV's official health check waits
# until its signature database and clamd engine are actually ready.
"${COMPOSE[@]}" up -d postgres clamav

# Preserve staging data before applying any forward migration.
"$ROOT/deploy/scripts/backup-staging-db.sh"

# Run forward-only Prisma migrations and keep the completed migration container
# so the API's service_completed_successfully dependency is explicit/auditable.
"${COMPOSE[@]}" up migrate --abort-on-container-exit --exit-code-from migrate

# Only after migration success replace/start the application containers.
"${COMPOSE[@]}" up -d api web
"${COMPOSE[@]}" ps
