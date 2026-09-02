# NT Message Hierarchy / Work V3 — Phase 1 & Phase 2 Completion Record

Date: 2026-09-03
Branch: `feature/nt-hierarchy-work-v3`
Pre-lock baseline commit: `3956805 feat: backfill Patan hierarchy and add legacy compatibility`
Master specification: `NT Message New Hierarchy and Work Management Master Specification v1.1 FINAL`

## Phase 1 — Office + OrgUnit + Closure + Membership Foundation

Status: **COMPLETE / RE-LOCKED**

Implemented foundation:

- `Office`
- configurable `OrgUnitType`
- recursive `OrgUnit`
- mandatory `OrgUnitClosure`
- effective-dated `OrgMembership`
- effective-dated `OrgLeadershipAssignment`
- delegated permission foundation
- one open primary membership per employee
- closure-table maintenance for hierarchy create/move operations
- non-destructive coexistence with legacy Division / Department / Team structures

### Corrective integrity hardening

Migration `20260903012000_enforce_org_unit_parent_same_office` was added as migration 78.

It adds a PostgreSQL trigger/function guard that rejects any `OrgUnit` parent relationship where the child and parent belong to different Offices. The application service already enforced this rule; migration 78 adds the database-level invariant required by the locked architecture.

Validation evidence:

- pre-migration cross-Office parent links: `0`
- migration 78 applied successfully
- database trigger installed and enabled
- database guard function installed
- direct cross-Office mutation attack: rejected with `check_violation`
- focused hierarchy suite: `4/4` tests passed
- final cross-Office parent links: `0`
- same-Office guard triggers: `1`

Pre-migration backup:

- file: `nt_message_before_migration78_20260903-014926.dump`
- SHA-256: `f1e23559c7d0e1bfebb486f223c97401663088c1d9d90c76d3ccd9d9cbd1e6db`

## Phase 2 — Legacy Hierarchy Backfill and Reconciliation

Status: **COMPLETE / LOCKED**

Completed migration/backfill:

- Patan Telecom Office root created
- legacy Divisions mapped to V3 OrgUnits
- legacy Departments mapped to V3 OrgUnits
- legacy Department Teams mapped to Team OrgUnits
- legacy-to-V3 mapping records retained for compatibility
- employee primary memberships backfilled
- team memberships backfilled as secondary memberships
- legacy management assignment history preserved as V3 leadership history
- team-admin history preserved as Team Lead history
- compatibility service remains read-only
- no legacy hierarchy schema was removed prematurely

Final reconciliation:

| Item | Count |
| --- | ---: |
| Offices | 1 |
| OrgUnits | 14 |
| Legacy mappings | 14 |
| Closure rows | 27 |
| Primary memberships | 13 |
| Secondary memberships | 7 |
| Org Unit Head history | 17 |
| Team Lead history | 3 |
| Office Head history | 0 |

`Office Head history = 0` is intentional at the Phase 2 lock. The legacy backfill does not infer an Office Head from old roles.

### Approved leadership decisions for Phase 3

- `NTC-1002 — Aakash Sah` is the confirmed Patan Telecom Office Head candidate.
- `NTC-1004 — Sunidhi Yadav` is the approved temporary Technical Org Unit Head.
- other existing users keep their current backfilled placement until the hierarchy-management flow is complete and they are manually reorganized.
- legacy leadership history must be preserved; active legacy-derived authority will be reconciled through controlled Phase 3 leadership work rather than hard deletion.

## Final Phase 0–2 Validation Gate

Validation completed successfully after migration 78:

- Prisma validate: PASS
- Prisma migration status: PASS
- migrations: `78`
- database ↔ Prisma drift: none
- API test suites: `71/71` passed
- API tests: `482/482` passed
- API production build: PASS
- Web tests: `27/27` passed
- Web production build: PASS
- English/Nepali catalog parity: `2709/2709` keys, 100%
- database reconciliation: PASS
- `git diff --check`: PASS

The logged attachment-storage, notification, monitoring, scanner and password-delivery warnings/errors during the API test run are expected synthetic failure-path test output; the affected suites passed and the final API result was `71/71` suites and `482/482` tests.

## Locked Exit State

- Phase 0 — COMPLETE / LOCKED
- Phase 1 — COMPLETE / RE-LOCKED
- Phase 2 — COMPLETE / LOCKED
- migration count — 78
- legacy schema — retained for compatibility and later controlled cutover
- next master phase — **Phase 3: Leadership, Acting/Deputy, Delegation and Authorization**

No Phase 1 or Phase 2 scope should be reopened unless a verified regression, integrity defect, or approved architecture change is found.
