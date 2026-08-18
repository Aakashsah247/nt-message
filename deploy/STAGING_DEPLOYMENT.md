# NT Message — Staging Deployment

This package prepares the current NT Message source for a production-mode testing/staging deployment without resetting the database.

## Oracle Always Free / Ampere A1 staging

For Oracle Ampere A1, use `VM.Standard.A1.Flex` with no more than the current
Always Free tenancy allowance (2 OCPUs and 12 GB RAM in total across A1
instances). The Docker stack is architecture-neutral: Node, PostgreSQL, Nginx,
and the ClamAV Debian image resolve native arm64 images automatically.

Recommended staging VM:

- Ubuntu 24.04 LTS (aarch64)
- 2 OCPUs
- 12 GB RAM
- 100 GB boot volume (within the overall Always Free block-volume allowance)
- public IPv4
- inbound TCP 22 only from the administrator IP where practical; TCP 80/443 public

Do not expose PostgreSQL (5432), NestJS (4000), ClamAV (3310), or the internal
web container port (8080) directly to the Internet.


## Architecture

- `web`: React/Vite static build served by Nginx
- `api`: NestJS/Socket.IO on Node.js 24
- `postgres`: PostgreSQL 18.4, private Compose network only
- `clamav`: ClamAV 1.4.6 LTS malware scanner required by the API in `NODE_ENV=production`; its stream/file limits are raised only enough to scan the app's allowed 200 MiB video uploads
- persistent bind mounts: attachments, profile photos, group photos
- SMTP: external approved relay/provider from `.env.staging`
- TLS: terminate HTTPS on the staging host/load balancer and proxy to `127.0.0.1:8080`

Valkey is intentionally not started by `compose.staging.yaml`: the current API source does not consume `VALKEY_URL`, so running it would add an unused service rather than improve staging fidelity.

## 1. Host requirements

- Linux staging server
- Docker Engine + Docker Compose plugin
- DNS name for staging
- TLS certificate or NTC/internal TLS termination
- outbound access to the approved SMTP server and browser push services as required
- enough disk for PostgreSQL, ClamAV signatures and attachment retention
- at least 4 GiB RAM available for ClamAV plus memory for PostgreSQL/API/web

## 2. Create staging environment

```bash
cp deploy/.env.staging.example .env.staging
chmod 600 .env.staging
```

Replace every placeholder. Generate independent staging secrets; do not reuse production secrets.

Generate a fresh VAPID key pair, for example from the API workspace after dependencies are installed:

```bash
pnpm --filter api exec web-push generate-vapid-keys
```

The old private VAPID value previously present in `.env.example` must be treated as exposed and must not be reused. The deployment bundle removes it from templates and bundle metadata.

## 3. Build/test before server deployment

With Node.js 24 and pnpm 11.6 installed:

```bash
pnpm install --frozen-lockfile
pnpm deploy:check
```

This validates Prisma, regenerates the Prisma client, builds web/API, and runs existing tests.

## 4. Database safety

Staging deployment uses only:

```bash
pnpm --filter api db:migrate:deploy
```

Do not use `prisma migrate dev`, `prisma db push --force-reset`, or database reset commands on staging data.

Before migrations, the staging deploy script automatically writes a PostgreSQL custom-format backup under `deploy-backups/`. Keep at least one verified off-server copy for important testing data.

## 5. Deploy

```bash
pnpm deploy:staging
```

Equivalent manual commands:

```bash
docker compose --env-file .env.staging -f compose.staging.yaml build
docker compose --env-file .env.staging -f compose.staging.yaml up -d postgres clamav
docker compose --env-file .env.staging -f compose.staging.yaml up migrate --abort-on-container-exit --exit-code-from migrate
docker compose --env-file .env.staging -f compose.staging.yaml up -d api web
```

The web container binds to `127.0.0.1:8080` by default. Put the server's HTTPS reverse proxy/load balancer in front of it.

## 6. Reverse proxy requirements

A host Nginx example is included at `deploy/nginx/host-tls.example.conf`. The external TLS proxy should forward all requests to `http://127.0.0.1:8080` and preserve:

- `Host`
- `X-Forwarded-For`
- `X-Forwarded-Proto: https`
- WebSocket upgrade headers

The inner Nginx container routes `/api/*` and `/socket.io/*` to the API and serves the React SPA for all other routes.

## 7. First-time staging database only

After migrations, seed the Super Admin only if this is a new empty staging database:

```bash
docker compose --env-file .env.staging -f compose.staging.yaml run --rm api \
  pnpm --filter api db:seed
```

Do not repeatedly use seed as a password-reset mechanism. The existing seed intentionally does not overwrite an existing Super Admin password.

## 8. Smoke test after deployment

Check at minimum:

1. `GET /api/v1/health` returns `status: ok` through the public HTTPS URL.
2. Login, refresh-token renewal and logout work.
3. Private chat and group messaging update in real time in two browsers.
4. Upload/download/stream an image, document, audio and video attachment.
5. ClamAV is reachable and uploads are stored with clean scan status.
6. Create account/invitation email reaches a test mailbox through the real SMTP path.
7. Browser push subscription works on HTTPS and a background notification is delivered.
8. Restart API/web containers and verify attachments/photos remain available.
9. Verify PostgreSQL is not published directly to the network.
10. Verify no `.env.staging`, database dump, private VAPID key or attachment binary is committed into Git.

## 9. Current staging limitations to keep visible

- Valkey exists in the project infrastructure concept, but the present API does not use it; horizontal API scaling should not be claimed yet.
- This staging layout runs one API replica. Multi-replica Socket.IO/presence scaling needs a shared adapter/session strategy before production scale-out.
- HTTPS is required for production-representative Web Push testing.
