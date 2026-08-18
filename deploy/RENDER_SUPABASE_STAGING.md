# NT Message — Temporary Render + Supabase Staging

This profile exists only for a short 5–7-user field test before deployment moves to Nepal Telecom infrastructure.

## Architecture

- Render Free Static Site: React/Vite frontend.
- Render Free Web Service: NestJS API + Socket.IO.
- Supabase Free: PostgreSQL + one private Storage bucket.
- Existing filesystem/ClamAV architecture remains the production path for NTC.

## Intentional staging compromises

1. Render Free can spin down after 15 minutes without HTTP/WebSocket activity and can take about a minute to wake.
2. Render Free filesystem is ephemeral, so permanent attachments/photos use Supabase Storage.
3. Supabase Free limits individual objects to 50 MB. This profile sets `ATTACHMENT_STORAGE_MAX_OBJECT_BYTES=52428800`; production limits remain unchanged when the variable is absent.
4. ClamAV is not available in this zero-cost topology. `ATTACHMENT_SCAN_MODE=disabled` is accepted in production mode only when BOTH `DEPLOYMENT_PROFILE=temporary_external_staging` and `ALLOW_UNSCANNED_STAGING_ATTACHMENTS=true` are set. Use synthetic/non-confidential attachments only.
5. Render Free blocks outbound SMTP ports 25, 465 and 587. Email testing requires a temporary provider on an allowed port (for example 2525) or can be deferred.

## Supabase setup

1. Create a Free project.
2. From **Connect**, copy the **Supavisor Session pooler** URI ending in port `5432`. Render does not support outbound IPv6, so do not use the direct `db.<ref>.supabase.co` URL.
3. In Storage create a bucket named `nt-message-staging` and keep it **Private**.
4. In API Keys copy a backend-only **secret key** (preferred) or legacy `service_role` key. Never place this key in Vite/frontend variables.
5. Free Storage supports up to 50 MB per object; do not change the staging cap above 50 MB.

## Render API service

Use the repository root.

- Runtime: Node
- Plan: Free
- Region: Singapore
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter api build`
- Start: `pnpm --filter api exec prisma migrate deploy --schema prisma/schema.prisma && pnpm --filter api db:seed && pnpm --filter api start:prod`
- Health: `/api/v1/health`

Copy variables from `deploy/render-supabase.env.example` into Render Environment. Do not upload the `.env` file itself.

After the API deploys, note its HTTPS URL, for example:

`https://nt-message-aakash-test-api.onrender.com`

## Render frontend

- Type: Static Site
- Plan: Free
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build`
- Publish directory: `apps/web/dist`
- Rewrite: `/*` -> `/index.html`

Set build variables:

- `VITE_API_URL=https://<api-service>.onrender.com/api/v1`
- `VITE_SOCKET_URL=https://<api-service>.onrender.com`

After the frontend deploys, copy its exact HTTPS URL into the API service's `WEB_ORIGIN` and redeploy/restart the API.

## Validation

Test in this order:

1. `GET /api/v1/health` returns OK.
2. Super Admin can sign in and refresh the session.
3. Create test employees/accounts required for the 5–7 testers.
4. Private message send/receive and Socket.IO realtime.
5. Group message send/receive.
6. Upload/download profile and group photos.
7. Upload/download attachments under 50 MB.
8. Video/audio range playback under the staging object limit.
9. Refresh the frontend and verify SPA routes still open.
10. Browser push if VAPID is configured.

Do not upload confidential Nepal Telecom documents to this third-party temporary staging environment.
