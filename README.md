# NT Message

NT Message is a secure internal communication and work-management platform for Nepal Telecom employees.

## Workspace

- `apps/web` — React, Vite and TypeScript frontend
- `apps/api` — NestJS, Prisma and PostgreSQL backend
- `packages/contracts` — shared application contracts/types

## Core runtime

- Node.js 24
- pnpm workspace
- PostgreSQL
- Socket.IO
- protected filesystem attachment storage
- ClamAV malware scanning for production-mode uploads
- SMTP email delivery
- Web Push background notifications

## Staging deployment

The repository now includes a production-mode staging deployment package:

- `compose.staging.yaml`
- `deploy/Dockerfile.api`
- `deploy/Dockerfile.web`
- `deploy/Dockerfile.clamav`
- `deploy/.env.staging.example`
- `deploy/nginx/`
- `deploy/scripts/`
- `deploy/STAGING_DEPLOYMENT.md`

Start with [`deploy/STAGING_DEPLOYMENT.md`](deploy/STAGING_DEPLOYMENT.md). Do not reset the database during deployment. Staging migrations use `prisma migrate deploy` only.
