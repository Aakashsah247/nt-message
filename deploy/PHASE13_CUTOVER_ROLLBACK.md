# NT Message Phase 13 — Production Cutover and Rollback Runbook

Checkpoint: **#21 — Cutover and rollback verification**
Architecture baseline: **Hierarchy + Work Management V3, V1.1 FINAL / IMPLEMENTATION LOCK**
Destructive boundary migration: **`20260913032500_remove_phase13_legacy_schema` (migration 106)**

## Purpose

Checkpoint #20 removed the retired Division/Department/DepartmentTeam, management-position and WM-V2 schema after reconciliation. Migration 106 is therefore a one-way schema boundary during normal deployment. NT Message does **not** use a hand-written down migration for this boundary.

If migration 106 has been applied and the release must be rolled back to code that still expects the removed schema, **application rollback alone is forbidden**. The safe recovery unit is the pre-cutover application revision **plus** the verified pre-migration database backup.

## Required records before the maintenance window

Record these values in the deployment ticket/log before changing production:

- current production application commit/tag (`PRE_CUTOVER_COMMIT`);
- Phase 13 release commit/tag (`CUTOVER_COMMIT`);
- current migration status and migration count;
- database host/database name (never copy credentials into the ticket);
- backup dump filename, SHA-256 and metadata filename;
- attachment/object-storage snapshot or platform backup reference;
- production environment/configuration backup reference;
- deployment operator and rollback decision owner;
- maintenance-window start/end time in Asia/Kathmandu.

Do not place `.env`, database dumps, attachment binaries or credentials in Git/source ZIPs.

## Hard safety rules

1. Use `prisma migrate deploy` in production. Never use `prisma migrate dev`, `prisma migrate reset` or schema push for this cutover.
2. Take and verify a database backup **before** migration 106 is applied to production.
3. Stop or block application writes during the destructive migration and initial validation window.
4. Keep the pre-cutover application artifact available until the release is accepted.
5. Do not attempt to recreate the dropped legacy tables/columns manually as a rollback technique.
6. After migration 106 is applied, rolling back to pre-Phase-13 code requires restoring the matching pre-migration database backup.
7. A database restore discards writes made after the backup. If production writes were allowed after cutover, preserve incident data and obtain an explicit recovery decision before restoring.

## 1. Pre-cutover application gate

Run from the exact release source that will be deployed:

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm --filter api test
pnpm --filter api build
pnpm --filter web test
pnpm --filter web build
pnpm --filter web lint
pnpm --filter web i18n:check

git diff --check
```

The Phase 13 source audit must also be zero:

```bash
pnpm --filter api phase13:audit-legacy
```

Do not enter the maintenance window with a failed gate.

## 2. Capture the pre-migration database state

Before applying migration 106 on production, run:

```bash
PHASE13_BACKUP_DIR=/secure/nt-message/deploy-backups \
  pnpm --filter api phase13:backup-db
```

The command creates three files:

- `*.dump` — PostgreSQL custom-format backup;
- `*.dump.sha256` — backup integrity hash;
- `*.dump.metadata.json` — source commit, redacted database identity and rollback-boundary metadata.

The backup command also runs `pg_restore --list`; an unreadable archive is rejected.

Copy the three files to protected backup storage before continuing. Record the SHA-256 in the deployment log.

### Restore rehearsal

A backup is not considered operationally verified only because `pg_dump` exited successfully. Before the production cutover, restore the backup into a disposable PostgreSQL database and validate it there.

Create an empty disposable database, keep the production API running against its normal database, and run:

```bash
PHASE13_BACKUP_FILE=/secure/nt-message/deploy-backups/<backup>.dump \
PHASE13_RESTORE_DATABASE_URL='postgresql://.../nt_message_phase13_restore_check' \
PHASE13_RESTORE_CONFIRM=RESTORE_PHASE13_BACKUP \
pnpm --filter api phase13:restore-db
```

Then point validation commands at the disposable restore and confirm the expected **pre-cutover** migration state. Drop the disposable database only after the restore result has been recorded.

Never use the production `DATABASE_URL` for a restore rehearsal.

## 3. Enter the maintenance window

Before database migration:

1. stop the API service or enable an infrastructure maintenance mode that blocks mutations;
2. stop background jobs/workers that can write to PostgreSQL;
3. confirm the current application artifact is still `PRE_CUTOVER_COMMIT`;
4. confirm the verified backup and its checksum are accessible;
5. confirm the Phase 13 release artifact is `CUTOVER_COMMIT`;
6. keep attachment/object storage intact — migration 106 changes PostgreSQL schema, not attachment binaries.

## 4. Apply the release and migration

Install/build the release artifact, then apply migrations exactly once:

```bash
pnpm install --frozen-lockfile
pnpm --filter api build
pnpm --filter web build

pnpm --filter api exec prisma migrate deploy \
  --schema prisma/schema.prisma
```

Immediately verify the database while the API is still stopped:

```bash
pnpm --filter api exec prisma migrate status \
  --schema prisma/schema.prisma

pnpm --filter api db:verify-phase13-schema-cleanup
pnpm --filter api db:verify-phase13-cutover-readiness
pnpm --filter api phase13:audit-legacy
```

Expected Phase 13 boundary:

- migration 106 is applied;
- database migration status is up to date;
- destructive schema cleanup verifier passes;
- cutover-readiness data gaps are zero;
- active runtime/schema legacy audit remains zero.

Do **not** run `db:seed` as an automatic production-start action for this cutover. Seeding is a bootstrap/recovery operation and must be deliberate.

## 5. Start API and Web in controlled order

1. Start the API using the Phase 13 release.
2. Verify API liveness:

```text
GET /api/v1/health
```

3. Verify database connectivity:

```text
GET /api/v1/health/database
```

4. Start/publish the Web application only after both API checks pass.
5. Keep the maintenance window active until the authorization smoke tests below pass.

## 6. Post-deployment smoke tests

Use dedicated production-safe test accounts/data where possible.

Required checks:

- Super Admin signs in and can view Work/Duty oversight but cannot perform operational Work or Duty mutations;
- Office Head can access own-Office organization and operational pages;
- Org Unit Head scope is limited to its authorized subtree;
- Team Lead scope remains team-bound;
- ordinary employee cannot obtain management actions;
- Work Overview/Create/Detail/My Work/Incoming Work load under V3 data;
- one permitted Work action can be completed end-to-end with correct stage authorization;
- Duty roster reads load using Office/OrgUnit scope and an authorized non-Super-Admin duty action works;
- Directory profile breadcrumb resolves from OrgUnit data;
- private messaging and an Official Group load/send path work;
- Office/OrgUnit announcement read path works;
- attachment download for an existing retained object still works;
- Reports V3 loads and a small export can be produced.

After smoke testing, run the database postflight again:

```bash
pnpm --filter api phase13:cutover-postflight
```

Only then remove maintenance mode and reopen normal traffic.

## 7. Rollback decision matrix

| Failure point | Database state | Safe response |
| --- | --- | --- |
| Before `prisma migrate deploy` | Pre-106 | Roll back application artifact only. Database restore is normally unnecessary. |
| Migration 106 fails before commit | Pre-106 because the migration is transactional | Keep API stopped, inspect migration status, then redeploy the pre-cutover application if the DB is confirmed pre-106. |
| Migration 106 applied; API has not accepted traffic | Post-106 | Prefer fixing/rolling forward. If rollback is required, restore the verified pre-106 DB backup and deploy `PRE_CUTOVER_COMMIT` together. |
| Migration 106 applied; production writes occurred | Post-106 with new writes | Do not restore automatically. Stop writes, preserve incident data, assess data loss, then choose roll-forward or an approved DB restore/reconciliation plan. |
| Web-only defect with healthy V3 API/DB | Post-106 | Roll back only to a Web artifact compatible with the V3 API. Never deploy a pre-106 API against the post-106 DB. |

## 8. Full database rollback after migration 106

Use this only after the rollback decision owner approves the restore.

1. Stop API/background writers and keep maintenance mode active.
2. Preserve logs and, if the post-cutover database contains useful incident writes, take a separate incident dump before restoring.
3. Verify the chosen backup checksum.
4. Restore with an explicit target URL and confirmation token:

```bash
PHASE13_BACKUP_FILE=/secure/nt-message/deploy-backups/<pre-106-backup>.dump \
PHASE13_RESTORE_DATABASE_URL='postgresql://.../nt_message' \
PHASE13_RESTORE_CONFIRM=RESTORE_PHASE13_BACKUP \
pnpm --filter api phase13:restore-db
```

5. Deploy `PRE_CUTOVER_COMMIT` before starting the API.
6. Validate the restored database with the Prisma migration status and validation commands from that **pre-cutover source revision**.
7. Start API, verify `/api/v1/health` and `/api/v1/health/database`, then start Web.
8. Perform login, messaging, Work, Duty and attachment smoke tests appropriate to the restored version.
9. Reopen traffic only after the restored application/database pair is confirmed healthy.

Do not run the post-106 schema-cleanup verifier against a deliberately restored pre-106 database; use the verifier set from `PRE_CUTOVER_COMMIT`.

## 9. Acceptance evidence for Checkpoint #21

Checkpoint #21 can be locked only when the deployment record contains:

- pre-cutover source commit/tag;
- release source commit/tag;
- successful source validation gate;
- verified custom-format DB backup + SHA-256;
- successful disposable-database restore rehearsal;
- production migration status output;
- Phase 13 schema-cleanup and cutover-readiness PASS output;
- API and DB health-check results;
- authorization/Work/Duty/messaging smoke-test record;
- explicit rollback decision owner and recovery procedure;
- confirmation that a pre-106 API will never be started against a post-106 database.

The defining recovery rule is: **after migration 106, application rollback across the Phase 13 destructive boundary is a database-restore operation, not only a code rollback.**
