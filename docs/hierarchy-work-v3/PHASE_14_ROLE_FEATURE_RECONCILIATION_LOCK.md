# Phase 14 — Role & Feature Reconciliation Lock

Phase 14 reconciles the previous role-oriented experience with the V3 recursive Office/OrgUnit authority model without restoring fixed hierarchy roles.

## Locked authority mapping

- `SUPER_ADMIN` remains outside the Office operational hierarchy. It keeps system/identity administration and read-only Work oversight, not operational Work, Duty, Team Management, or emergency-sender authority.
- Office Head receives Office-wide operational management that previously lived on the operational side of the old Super Admin experience.
- A top-level `ORG_UNIT_HEAD` is presented as `ORGANIZATION_HEAD` and carries the previous Senior Management feature family within its subtree.
- A lower-level `ORG_UNIT_HEAD` carries the previous Team Manager feature family within its own subtree, regardless of hierarchy depth.
- Operational Team Lead is an employee assignment (`OperationalTeamLeadAssignment`), never a formal OrgUnit hierarchy level or separate account type.
- A normal Office User remains an employee with personal Work/Duty and communication surfaces.

## Recursive hierarchy

OrgUnit depth is not fixed. A Technical organization may contain five, six, or more nested OrgUnits. Authorization follows effective Office/OrgUnit leadership scope and closure-table ancestry rather than named levels such as Division, Department, or Team.

## Separate domains

`Organization & People` manages the formal Office hierarchy, memberships, leadership, acting assignments, deputies, and delegation.

`Team Management` manages operational employee groups using `OperationalTeam`, `OperationalTeamMember`, and `OperationalTeamLeadAssignment`. Team Management must never alias to `/organization` and must not recreate retired `DepartmentTeam` behavior.

## Delegation and acting authority

Acting Office/OrgUnit leadership is represented by effective leadership assignments and therefore receives the same scoped workspace family while its assignment is active.

Explicit delegated capabilities do not change a person's formal hierarchy identity. The workspace context surfaces only the pages required by active delegated capabilities; backend capability/scope checks remain authoritative for every action.

Team Management itself is not implied by Team Lead status or unrelated delegation. It remains structural operational-team administration for Office Head and OrgUnit Head scope.

## Locked page boundaries

- Office Head: management Dashboard, Directory, Organization & People, Account Requests, Work Management, Incoming Work, Duty Roster, Team Management, Reports, Work Types, Messages, Settings; no separate My Work/My Duty.
- OrgUnit Head: scoped management Dashboard, Directory, Organization & People, Account Requests, Work Management, Incoming Work, Duty Roster, My Duty, Team Management, Reports, Messages, Settings; no separate My Work.
- Operational Team Lead: employee identity plus team-scoped Work/Duty authority, My Work, My Duty, Messages, Settings; no formal Organization/Team administration by Team Lead status alone.
- Employee: Dashboard, My Work, My Duty, Messages, Settings, plus only explicitly delegated workspaces when a valid delegation exists.
- Super Admin: system/identity administration, Organization Viewer, System Analytics, Monitoring & Audit, Messages, Settings, and read-only Work Oversight; no operational mutation pages.

## Safety boundaries

- Do not reset or clear the Phase 13/14 database.
- Do not merge the feature branch into deployed `main` during this reconciliation. `main` remains a read-only behavioral reference.
- Do not reintroduce fixed `SENIOR_MANAGEMENT` / `TEAM_MANAGER` authorization or retired Division/DepartmentTeam runtime models.
