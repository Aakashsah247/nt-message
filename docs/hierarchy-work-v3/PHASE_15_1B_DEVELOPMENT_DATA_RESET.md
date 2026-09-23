# Phase 15.1-B — Development Data & Organization Reset

This checkpoint is intentionally development-only. It keeps account and employee identity records while removing dummy organization, Work, Duty, messaging, team, account-request, delegation, and other operational data.

## Preserved

- `accounts`
- `employees`
- `super_admin_profiles`
- `_prisma_migrations`
- Password hashes, account classes, account preferences, employee IDs, names, contact fields, designation, activation state, and profile fields stored on the preserved rows

## Reset

All other public application tables are cleared. This includes the previous Office/OrgUnit structure, Org memberships and leadership, Operational Teams, Work, Duty, messaging, announcements, account requests, delegations, Work Types, audit/activity rows, sessions, and notifications.

The reset intentionally invalidates existing login sessions. Users sign in again with the same preserved credentials.

## Clean V3 foundation after reset

The script creates:

- one active `PATAN` Office (`Patan Telecom Office`)
- finalized formal OrgUnit types: Division, Department, Section, Unit
- one internal inactive `PLACEMENT_PENDING` type used only by the temporary Placement Pending OrgUnit
- one temporary `Placement Pending` OrgUnit
- one active PRIMARY membership for every active employee in `Placement Pending`
- the existing permanent Office Head assignment, only when exactly one active permanent Office Head existed before reset

Legacy employee `department` text values are cleared. Formal hierarchy types are Division, Department, Section, and Unit. Generic Organization/Area/Other types are not seeded for new hierarchy creation. Operational Teams continue to use the separate `OperationalTeam` model and are never formal OrgUnit types.

After the new hierarchy is created, move employees from `Placement Pending` into their real primary OrgUnits and then deactivate/remove the temporary unit when empty.

## Safety

The reset:

- refuses `NODE_ENV=production`
- refuses non-local database hosts
- requires the database name `nt_message`
- is dry-run by default
- requires `--execute` plus `NT_MESSAGE_ALLOW_DEVELOPMENT_DATA_RESET=RESET_DUMMY_V3_DATA`
- creates and verifies a custom-format PostgreSQL backup before changing data
- executes destructive table clearing and V3 reseeding inside a transaction
- verifies account/employee counts and V3 invariants afterward

Do not use this command against a deployed or production database.
