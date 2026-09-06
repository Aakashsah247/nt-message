# NT Message Hierarchy & Work V3 — Phase 6 Runtime Foundation

## Milestone

**P6-A — Runtime Architecture + Data Foundation**

Development branch: `feature/nt-hierarchy-work-v3`

Master specification: `NT Message Hierarchy + Work Management Master Specification V1.1 FINAL`

This milestone establishes the additive database/runtime contract for Work Management V3. It deliberately does **not** switch live Work creation, reads, reports or UI from the existing Work Management runtime.

## Current runtime audit

The Phase 6 source audit confirms that the live runtime is still the WM-V2 compatibility path. `WorkItem` remains coupled to `WorkItemType`, legacy Division/Department/DepartmentTeam ownership, `responsibleManagerAccountId`, optional Sales-member state and the existing assignment/completion/help/report structures. `WorkItemsService`, `WorkLifecycleService`, `WorkScopeService`, Work Reports, Sales communication, notifications and the current Management/Employee Work pages still consume those contracts.

That coupling is intentionally left operational in P6-A. The V3 runtime is added beside it so the engine can be proven before any write/read cutover. There is no attempt to maintain two permanent business engines: the legacy path is temporary compatibility input and will be retired only through the controlled migration sequence.

## Architecture lock

The Phase 6 runtime foundation follows these non-negotiable rules:

- a Work is an Office-level business object;
- every V3 Work has exactly one Primary Owner OrgUnit;
- the Work is permanently bound to the published Work Type Version selected at creation;
- participant OrgUnits and every runtime stage remain inside the Work Office;
- each receiving OrgUnit controls assignment of its own people;
- Super Admin has read-only operational Work access and is never an execution/approval actor;
- stage state, assignment history, submissions, approvals and Work events are stored as explicit runtime history rather than inferred from mutable UI state;
- overall Work status is derived by the runtime engine from stage state and final-closure policy; `currentStageId` is not introduced as a source of truth;
- runtime flexible values are validated against versioned field definitions and stored as JSONB; searchable identifiers are normalized into `WorkReference`;
- Work and Stage mutable aggregates use optimistic versions;
- legacy Work rows remain valid until controlled migration/backfill and cutover.

## Additive WorkItem V3 context

The existing `work_items` table remains the authoritative Work identity during migration. P6-A adds nullable V3 binding fields only:

- `office_id`
- `work_type_version_id`
- `primary_owner_org_unit_id`
- `runtime_status`
- `opened_at`

The V3 context is all-or-nothing: an existing legacy row may keep all four required V3 binding/status fields NULL, while a V3-bound Work must populate all four. Once a Work is V3-bound, its Office and Work Type Version are immutable. Primary Owner changes, when permitted later by the runtime engine, must be recorded in `WorkOwnershipTransfer`.

## Runtime entities

P6-A introduces the normalized runtime structures required by the master architecture:

| Entity | Responsibility |
| --- | --- |
| `WorkOrgUnitParticipant` | Effective-dated OrgUnit participation, including the single Primary Owner participant. |
| `WorkStage` | Runtime snapshot of a published stage definition plus mutable stage state/version/timing. |
| `WorkStageAssignment` | Effective-dated queue/team/account assignment history inside the responsible Office. |
| `WorkStageSubmission` | Immutable numbered executor submission with validated values snapshot. |
| `WorkStageApproval` | Immutable approval or return decision for a specific submission. |
| `WorkFieldValue` | Current validated runtime value linked to a published field definition. |
| `WorkReference` | Indexed normalized identifiers such as token/service/customer/payment references. |
| `WorkOwnershipTransfer` | Audited genuine Primary Owner transfer history. |
| `WorkEvent` | Authoritative V3 Work/stage event timeline. |

The published `WorkStageDefinition` dependency graph remains the immutable workflow template. P6-A does not duplicate that graph into another runtime dependency table. The runtime engine will evaluate each Work's immutable Work Type Version and current stage state when activating dependent stages.

## Runtime state contract

Work runtime states:

`DRAFT -> OPEN -> IN_PROGRESS / WAITING / BLOCKED -> COMPLETED | CANCELLED`

The engine may move between `IN_PROGRESS`, `WAITING` and `BLOCKED` according to actionable stage state. Reopen is an audited event that reactivates an explicit stage; it is not a permanent overall Work status.

Stage runtime states:

`PENDING`, `READY`, `IN_PROGRESS`, `BLOCKED`, `SUBMITTED`, `RETURNED`, `COMPLETED`, `SKIPPED`, `CANCELLED`.

Legal transitions and optimistic compare-and-update behavior are implemented in P6-B. P6-A only provides the persistence constraints required to make those rules enforceable safely.

## Database integrity boundary

Migration `20260907010000_add_work_runtime_v3_foundation` adds database-level guards for invariants that must not depend only on HTTP/service code:

- V3 Work context is complete or absent;
- Work Type Version and Primary Owner belong to the Work Office;
- V3 Work Office and Work Type Version cannot silently change;
- only one active Primary Owner participant exists;
- participant OrgUnits belong to the Work Office;
- runtime stage definitions belong to the Work's immutable Work Type Version;
- stage responsible OrgUnits belong to the Work Office;
- assignment target shape is valid and only one active PRIMARY assignment exists;
- Team assignments point to Team OrgUnits;
- account assignments require an effective membership in the Work Office;
- field definitions/stage values belong to the Work's version/stage;
- reference source fields belong to the Work Type Version;
- approval submission and stage must match;
- stage-scoped Work events must belong to the same Work;
- ownership-transfer OrgUnits remain inside the Work Office;
- versions, submission numbers and SLA values are positive.

These database guards complement, rather than replace, server-side capability/scope/business-rule authorization.

## Indexing foundation

P6-A adds the master-plan query directions needed by the runtime engine and later reporting:

- Work by Office/runtime status/created time;
- Work by Primary Owner/runtime status/due time;
- Work by Work Type Version/created time;
- participants by Work/OrgUnit/active role;
- stages by Work/status and responsible OrgUnit/status;
- active stage assignments by queue/team/account;
- references by type/normalized value and Work/type;
- events by Work/time, stage/time and actor/time;
- ownership transfers by Work/time and OrgUnit/time.

## Compatibility and migration rule

This milestone is intentionally **schema-only for live runtime behavior**:

- existing `WorkItem.type`, Division/Department/Team ownership, Sales fields, completion data, `WorkAssignment`, `WorkActivity` and other legacy structures remain untouched;
- no existing Work row is backfilled by migration 85;
- all newly created runtime tables are expected to be empty immediately after migration 85;
- no current Work API endpoint is switched to V3 writes or reads in P6-A;
- no report, Duty, Messaging, Directory, Official Group or Announcement migration is included;
- migration/backfill starts only after the P6-B runtime API gates are proven.

The controlled cutover order remains:

`ADD -> BACKFILL -> RECONCILE -> COMPATIBILITY READS -> SWITCH NEW WRITES -> SWITCH READS/UI/REPORTS -> FULL REGRESSION -> DISABLE LEGACY WRITES -> REMOVE LEGACY READS -> DROP LEGACY SCHEMA LAST`.

## P6-B handoff

P6-B will consume this foundation as one substantial runtime-engine milestone. It will implement creation from a published Work Type Version, Primary Owner auto-routing, participant/stage instantiation, controlled field/reference validation, dependency activation, assignment queues, stage transitions, submissions, approvals/returns, optimistic concurrency, derived Work status, final completion rules, `availableActions`, authorization and end-to-end API tests.

P6-A does not claim completion until migration 85 has passed Prisma validation/generation, backup/deploy, database reconciliation, focused API validation and `git diff --check` on the developer machine.