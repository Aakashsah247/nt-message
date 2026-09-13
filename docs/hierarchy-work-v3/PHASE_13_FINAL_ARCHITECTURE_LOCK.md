# NT Message — Phase 13 Final Architecture Lock

Status: **PHASE 13 — COMPLETE / FINAL ARCHITECTURE LOCK — 23/23**

Specification baseline: **NT Message Hierarchy + Work Management Master Specification V1.1 FINAL / IMPLEMENTATION LOCK**

Lock date: **13 September 2026**

## 1. Lock scope

Phase 13 closes the migration from the retired fixed Division → Department → Team authority model to the V3 Office/OrgUnit architecture. No further architecture redesign is part of this checkpoint. New requirements after this lock must be treated as controlled changes with migration, authorization, data-history and deployment impact reviewed before implementation.

The locked operational model is:

- **Office** is the organizational and security root.
- **OrgUnit** is recursive; authorization does not depend on fixed numeric hierarchy depth.
- **OrgMembership** is effective-dated and provides the employee's current official placement.
- **OrgLeadershipAssignment**, Operational Team leadership and delegated capabilities provide scoped authority.
- **Super Admin** is a platform/system and identity administrator outside the Office hierarchy. Super Admin may use operational oversight/read surfaces but may not perform operational Work or Duty mutations.
- **Office Head** is the highest operational authority inside the Office.
- **Org Unit Head** authority remains within the authorized subtree.
- **Deputy, Acting and delegated authority** are capability/scope/effective-time bounded and may not escalate beyond the source authority.
- **Work V3** has one Primary Owner OrgUnit and may have multiple participating OrgUnits/stages. A receiving OrgUnit controls assignment of its own people.
- **Duty, Reports, Messaging, Official Groups, Announcements and Directory** use Office/OrgUnit scope rather than the retired fixed hierarchy.
- Historical Work, Duty, communication and audit meaning is preserved; inactive historical references are not rewritten to current organization state.

## 2. Phase 13 exit-criteria evidence

| Master-plan exit requirement | Final evidence | Lock status |
| --- | --- | --- |
| No legacy writes | Phase 13 legacy dependency census: all tracked active runtime/schema categories = 0 | PASS |
| No legacy read dependencies | Phase 13 legacy dependency census: all tracked active runtime/schema categories = 0 | PASS |
| Remove obsolete enums/fields/services | Destructive schema-cleanup verifier checks 8 retired tables, 28 retired columns, 4 retired enums and 4 reduced enums | PASS |
| Full migrations/test/build | Prisma current at 106 migrations; API/Web regressions and builds green | PASS |
| Production cutover/rollback checklist | `deploy/PHASE13_CUTOVER_ROLLBACK.md`; backup + checksum + disposable restore rehearsal completed | PASS |
| Final project architecture locked | This report plus `phase13:final-lock` verifier | PASS |

The final active legacy audit is zero for all tracked categories:

1. legacy account roles;
2. legacy hierarchy IDs;
3. legacy hierarchy models;
4. legacy management models;
5. legacy Work enum;
6. legacy Work team/manager fields;
7. legacy fixed-scope message-request reasons;
8. legacy Work-Type bridge.

## 3. Final database and migration state

- Prisma schema validation: **PASS**.
- Prisma migration status: **106 migrations**, database up to date.
- Destructive boundary: `20260913032500_remove_phase13_legacy_schema` (migration 106).
- Destructive schema cleanup: **PASS**.
- Cutover readiness: **PASS**.
- `super_admin_accounts`: 1.
- `account_class_role_mismatches`: 0.
- `active_employee_primary_membership_gaps`: 0.
- `org_unit_self_closure_gaps`: 0.
- `work_v3_context_gaps`: 0.
- `account_request_v3_scope_gaps`: 0.
- `duty_v3_scope_gaps`: 0.
- `official_group_v3_scope_gaps`: 0.
- `announcement_v3_scope_gaps`: 0.

The development database was preserved throughout Phase 13. No database reset was used to obtain the final state.

## 4. Final regression evidence

### API

- Full API Jest regression: **114 / 114 suites PASS**.
- Full API assertions: **674 / 674 tests PASS**.
- API E2E: **1 / 1 PASS**.
- E2E open-handle diagnostic (`--detectOpenHandles --runInBand`): **PASS; no reproducible open handle**.
- API ESLint: **PASS**.
- Nest API build: **PASS**.

The E2E harness is locked with the generated-Prisma `.js` resolver mapping, Node VM-module support required by the Prisma runtime, one application bootstrap per suite, and explicit application teardown.

### Web

- Web regression: **109 / 109 tests PASS**.
- Web ESLint: **PASS**.
- English/Nepali i18n catalogue parity: **3066 / 3066 keys (100%)**.
- TypeScript + Vite production build: **PASS**.
- `git diff --check`: **PASS**.

The responsive guard suite includes mobile touch-target coverage for messaging/detail actions and responsive canonical Work navigation. Production cutover still requires the operational smoke checklist in the deployment runbook against the deployed environment.

## 5. Critical authorization lock evidence

The final source keeps regression coverage for the V1.1 security gates:

| Locked rule | Regression evidence |
| --- | --- |
| Super Admin cannot perform operational Work mutations | `organization-authorization.service.spec.ts`, `work-scope.service.spec.ts` |
| Super Admin Duty is strictly read-only | `duty-authorization.service.spec.ts` |
| Super Admin cannot create internal Office delegation | `organization-delegation.service.spec.ts` |
| Org Unit Head cannot operate outside its subtree | `organization-authorization.service.spec.ts` |
| One OrgUnit cannot directly assign an out-of-scope employee | `work-scope.service.spec.ts`, Duty scope regression suites |
| Acting/delegated authority cannot outlive its effective period | `organization-authorization.service.spec.ts` |
| Deputy receives only explicitly delegated capability | `organization-authorization.service.spec.ts` |
| Delegation cannot escalate beyond source capability/scope/time | organization authorization/delegation regression suites |
| Protected identity changes remain separately controlled | account-request/activation/employee identity correction regression suites |
| Communication hierarchy is Office/OrgUnit-native | `communication-v3-architecture-lock.spec.ts` and Phase 12/13 Web architecture-lock tests |

These tests are part of the final green API/Web regression state; the final verifier also checks that the core lock artifacts remain present.

## 6. Cutover and rollback lock

The production boundary is documented in `deploy/PHASE13_CUTOVER_ROLLBACK.md`.

Critical recovery rule:

> After migration 106 has been applied, a pre-106 API must never be started against the post-106 database. Rollback across the destructive boundary requires the matching pre-106 application revision and verified pre-migration database backup to be restored together.

Checkpoint #21 verified:

- custom-format PostgreSQL backup creation;
- SHA-256 checksum generation/verification;
- archive verification with `pg_restore --list`;
- restore into a disposable database;
- restored migration state validation;
- Phase 13 schema/cutover checks against the disposable restore;
- postflight checks against the normal development database.

## 7. Source-package hygiene lock

Source backups must be created from the **current local folder**, not from Git, while excluding local/private/runtime artifacts.

Use:

```bash
python3 scripts/create_source_backup.py \
  --output ~/Downloads/nt-message-source-$(date +%Y%m%d-%H%M%S).zip
```

On Windows PowerShell with Python Launcher:

```powershell
py -3 scripts/create_source_backup.py --output "$HOME\Downloads\nt-message-source.zip"
```

The backup tool excludes and then verifies absence of:

- `.git`;
- `node_modules`;
- `dist`, `build`, coverage and test-output directories;
- real `.env`/local environment override files while retaining non-secret `.example` templates;
- `apps/api/storage` runtime attachments/photos;
- generated Prisma client output;
- database dumps/backups;
- logs, TypeScript build cache and OS metadata.

The tool performs ZIP CRC validation and fails if a prohibited path is still present.

## 8. Final validation command

Run the final architecture/database lock from the API package:

```bash
pnpm --filter api phase13:final-lock
```

Then keep the already-required repository gate green:

```bash
pnpm --filter api lint
pnpm --filter api build
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web i18n:check
pnpm --filter web build
git diff --check
```

Checkpoint #22 is the authoritative full-regression run. Checkpoint #23 adds the architecture/report/source-package lock and must not introduce new business behavior.

## 9. Known non-blocking observations

- Vite/Babel reports that `MessageAppPage.tsx` is large enough to deoptimize code-generation styling, and final Web bundles are large. This is a future frontend performance/code-splitting concern, not a Phase 13 architecture or correctness failure.
- Node prints an experimental warning when Jest E2E uses `--experimental-vm-modules`; the E2E suite itself passes.
- Deliberate negative-path tests log simulated storage/database/scanner failures; the corresponding suites pass and these logs are not production incidents.

## 10. Change lock

With the final verifier and repository gates green, Phase 13 is closed under the V1.1 implementation lock.

**PHASE 13 — COMPLETE / FINAL ARCHITECTURE LOCK — 23/23**

Any later change to Office/OrgUnit authority, Super Admin operational boundaries, Work ownership/participant semantics, delegation/leadership scope, destructive migration recovery, or legacy compatibility removal requires a controlled change request and a new migration/security/regression impact review.
