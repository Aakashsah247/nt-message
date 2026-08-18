#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail=0

check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $1" >&2
    fail=1
  fi
}

env_value() {
  local key="$1"
  local line value
  line="$(grep -m1 -E "^${key}=" .env.staging 2>/dev/null || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

check_command node
check_command pnpm

NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]' 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" != "24" ]]; then
  echo "ERROR: NT Message requires Node.js 24.x; current: $(node -v 2>/dev/null || echo missing)" >&2
  fail=1
fi

if [[ ! -f .env.staging ]]; then
  echo "ERROR: .env.staging is missing. Copy deploy/.env.staging.example first." >&2
  fail=1
else
  if grep -Eq 'REPLACE_WITH|replace_with|example\.ntc\.net\.np' .env.staging; then
    echo "ERROR: .env.staging still contains deployment placeholders." >&2
    fail=1
  fi

  required=(
    WEB_ORIGIN DATABASE_URL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
    SMTP_HOST SMTP_PORT SMTP_FROM
    JWT_ACCESS_SECRET JWT_REFRESH_SECRET OTP_HASH_SECRET ACTIVATION_TOKEN_SECRET
    AUTH_COOKIE_NAME ATTACHMENT_STORAGE_ROOT ATTACHMENT_SCAN_MODE
    WEB_PUSH_VAPID_PUBLIC_KEY WEB_PUSH_VAPID_PRIVATE_KEY WEB_PUSH_VAPID_SUBJECT
  )

  for key in "${required[@]}"; do
    if [[ -z "$(env_value "$key")" ]]; then
      echo "ERROR: $key is missing or empty in .env.staging" >&2
      fail=1
    fi
  done

  if [[ "$(env_value NODE_ENV)" != "production" ]]; then
    echo "ERROR: staging should run NODE_ENV=production to exercise secure cookies and production safety checks." >&2
    fail=1
  fi

  if [[ "$(env_value ATTACHMENT_SCAN_MODE)" != "clamav" ]]; then
    echo "ERROR: ATTACHMENT_SCAN_MODE must be clamav for production-mode staging." >&2
    fail=1
  fi

  if [[ "$(env_value WEB_ORIGIN)" != https://* ]]; then
    echo "WARNING: WEB_ORIGIN is not HTTPS. Core testing can work, but browser push notifications will not be production-representative." >&2
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "Environment preflight passed."

# Prisma tooling explicitly reads staging configuration. Application tests stay
# isolated and are not forced into NODE_ENV=production.
export NT_MESSAGE_ENV_FILE="../../.env.staging"
pnpm --filter api db:validate
pnpm --filter api db:generate
unset NT_MESSAGE_ENV_FILE

pnpm --filter web build
pnpm --filter api build
pnpm --filter web test
pnpm --filter api test -- --runInBand

echo "NT Message staging preflight passed."
