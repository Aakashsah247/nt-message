# NT Message staging preparation — validation report

Date: 2026-08-18

## Source audited

The staging preparation was made from the uploaded snapshot generated on 2026-08-18 at 10:09:51 +05:45.

## Deployment blockers corrected

- Removed the previously bundled Web Push private VAPID key from `.env.example` and stripped bundle metadata that still contained it. A fresh staging VAPID pair is required.
- Added configurable `API_HOST`; Docker can bind the API to `0.0.0.0` while normal local development keeps `127.0.0.1`.
- Added `GET /api/v1/health` for container/reverse-proxy health checks.
- Added `prisma migrate deploy` staging workflow; no reset or `migrate dev` is used.
- Added production-mode ClamAV and persistent storage wiring.
- Raised ClamAV stream/file limits so the application's allowed 200 MiB video upload is actually scanable.
- Added same-origin Nginx routing for React, `/api/*`, Socket.IO and the service worker.
- Added pre-migration PostgreSQL backup automation.
- Added staging secret/environment template without real secrets.

## Checks completed in the preparation environment

- staging Compose YAML parsed successfully
- all deployment shell scripts pass `bash -n`
- deploy script rejects `.env.staging` while example placeholders remain
- modified TypeScript files pass TypeScript syntax transpilation
- inner Nginx configuration passes `nginx -t` after substituting the Docker-only upstream hostname for local syntax validation
- host HTTPS/TLS Nginx example passes `nginx -t` with a temporary test certificate
- JSON package files parse successfully
- exposed VAPID key search returns no matches in the staging-ready tree

## Checks that still must run on the actual project machine/server

The preparation environment does not contain the repository's dependencies, Docker Engine, pnpm, or the required Node.js 24 runtime, and outbound package-registry access is disabled. Therefore it cannot truthfully claim the complete application build/test or Docker image build has passed here.

Before deployment, run on a Node.js 24 machine with pnpm 11.6 and Docker:

```bash
pnpm install --frozen-lockfile
cp deploy/.env.staging.example .env.staging
# Fill .env.staging with real staging values, then:
pnpm deploy:check
docker compose --env-file .env.staging -f compose.staging.yaml config
pnpm deploy:staging
```

Do not mark the staging release validated until `pnpm deploy:check`, Docker Compose config validation, image builds, migrations and the post-deploy smoke tests all pass.
