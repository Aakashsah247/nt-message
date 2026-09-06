# NT Message Hierarchy & Work V3 — P6-B Runtime Engine Part 1

## Scope

This is **Part 1 of at most three P6-B implementation patches**. It implements native V3 Work creation and initial runtime instantiation. It does not add stage assignment/execution, submission/approval, collaboration, SLA calendar/escalation, frontend cutover or legacy Work backfill.

## Delivered runtime boundary

- new Work is created from an active `PUBLISHED` Work Type Version;
- the client cannot choose the Primary Owner; it is copied from the immutable published version;
- Super Admin remains denied operational Work creation;
- an active Office member must first possess the base `work.create` capability and then pass the Work Type creator category/account/scope policy;
- exactly one active primary Office membership is required;
- explicit creator accounts are supported without inventing hierarchy roles;
- Office Head, Org Unit Head, Team Lead and Employee creator categories are evaluated against effective leadership/membership at creation time;
- `PRIMARY_OWNER_SUBTREE`, `SPECIFIC_ORG_UNITS` and `OFFICE_WIDE` creator scopes are enforced with `OrgUnitClosure`;
- the Work permanently binds to the published Work Type Version and auto-routed Primary Owner;
- no browser-supplied Division, Department, legacy Team or responsible-manager value is accepted.

## Native V3 compatibility boundary

Migration `20260907024500_prepare_work_runtime_v3_creation` makes only the WM-V2-only `WorkItem` columns nullable (`type`, `division_id`, `registered_at`, `responsible_manager_account_id`). Database checks preserve those fields as mandatory for legacy rows while requiring them to remain empty on V3-bound Work.

No existing Work row is changed by migration 86. Legacy and V3 rows are distinguished by the P6-A V3 Office/runtime binding. Legacy schema removal remains a later controlled cutover step.

The migration also adds a creator/request UUID and SHA-256 fingerprint. A partial unique index plus a transaction-scoped PostgreSQL advisory lock makes Work creation retry-safe under concurrent duplicate requests. Reusing the same request ID with different content is rejected rather than silently returning the wrong Work.

## Field runtime

Creation validates only intake fields (`stageDefinitionId = NULL`). Stage-bound completion/submission fields cannot be supplied early.

Supported intake values are validated against their immutable field definition/configuration:

- text / long text / reference length;
- integer and decimal range;
- strict date and normalized datetime;
- boolean;
- controlled select / multi-select options and selection limits;
- active same-Office user references;
- active same-Office OrgUnit references.

`REFERENCE` values are stored both as validated JSONB field values and normalized `WorkReference` rows for indexed lookup/reporting. Required IMAGE/FILE intake is intentionally rejected until attachment runtime integrity exists; the service does not accept unaudited arbitrary file identifiers.

## Runtime stage instantiation

Every configured Phase-6-compatible stage becomes a `WorkStage` snapshot containing responsible OrgUnit, assignment mode, approval mode, activation rule and SLA values from the immutable Work Type Version.

- `PRIMARY_OWNER` responsibility resolves to the Work Primary Owner;
- `SPECIFIC_ORG_UNIT` resolves to its configured active same-Office OrgUnit;
- `RUNTIME_REQUESTED_PARTICIPANT` is rejected in Part 1 because it belongs to the cross-OrgUnit collaboration milestone rather than being faked with a placeholder owner;
- Primary Owner and configured responsible OrgUnits are created as active Work participants before stages, satisfying the P6-A database integrity trigger;
- initial `ALWAYS` stages with satisfied dependencies become `READY`;
- false field conditions become `SKIPPED`;
- manual/deferred conditions remain `PENDING`;
- a stage whose only predecessors are initially skipped may become `READY`;
- stage SLA due time begins only when the stage becomes READY.

The initial Work runtime state is `OPEN` when at least one stage is READY, otherwise `WAITING`. Completion is deliberately left to Part 3 where final-closure policy is implemented.

## Audit

Creation writes:

- `WORK_CREATED` with immutable Work Type/owner/request context;
- `STAGE_READY` for initially actionable stages;
- `STAGE_SKIPPED` for initial false conditions.

The legacy `WorkActivity` timeline is not written for native V3 Work.

## P6-B remaining parts

### Part 2 — Stage + Assignment Execution Engine

Assignment queues, receiving-OrgUnit staff ownership, Team/User/OrgUnit assignment rules, start/block/resume/submit transitions, optimistic stage concurrency and transition events.

### Part 3 — Approval + Completion + Final Runtime API

Approval/return, dependency release after completion, derived overall Work status, final closure, controlled cancel/reopen boundaries required by Phase 6, backend `availableActions`, end-to-end API tests and final P6-B regression.
