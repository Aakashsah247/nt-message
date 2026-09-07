-- Phase 8 / P8-C: project legacy WM-V2 execution and assignment history into
-- the Work Runtime V3 compatibility structures.
--
-- This migration is intentionally additive:
--   * legacy Work rows and legacy assignment/activity rows are preserved;
--   * one EXECUTION runtime-stage snapshot is created for every compatibility
--     Work row;
--   * legacy person assignments are always preserved as WorkEvent history;
--   * a live WorkStageAssignment is created only when the legacy evidence can
--     be represented without violating the published V3 assignment mode and
--     OrgUnit-scope integrity rules;
--   * cross-OrgUnit Supporting/legacy executor participation is represented as
--     SUPPORTING_PARTICIPANT where a deterministic active PRIMARY membership is
--     available in the same Office;
--   * Sales/help/completion submission/approval detail remains for the later
--     dedicated Phase 8 migration steps.
--
-- In particular, TEAM-mode EXECUTION stages are never backfilled with direct
-- ACCOUNT assignments. A legacy person assignment that cannot be represented
-- safely remains authoritative in the legacy table and is mirrored into the V3
-- event timeline with projectionKind = HISTORY_ONLY.

DO $$
DECLARE
  legacy_work_count INTEGER;
  legacy_assignment_count INTEGER;
  projected_stage_count INTEGER;
  projected_assignment_event_count INTEGER;
  projected_participant_count INTEGER;
  runtime_assignment_candidate_count INTEGER;
  runtime_assignment_projected_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO legacy_work_count
  FROM "work_items"
  WHERE "status" <> 'V3_RUNTIME';

  SELECT COUNT(*)
  INTO legacy_assignment_count
  FROM "work_assignments" assignment_record
  JOIN "work_items" work_item
    ON work_item."id" = assignment_record."work_item_id"
  WHERE work_item."status" <> 'V3_RUNTIME';

  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" <> 'V3_RUNTIME'
      AND (
        "office_id" IS NULL
        OR "work_type_version_id" IS NULL
        OR "primary_owner_org_unit_id" IS NULL
        OR "runtime_status" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-C requires every legacy Work row to have a complete V3 compatibility identity.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" <> 'V3_RUNTIME'
      AND "status" NOT IN (
        'ASSIGNED',
        'ACKNOWLEDGED',
        'IN_PROGRESS',
        'HELP_REQUESTED',
        'COMPLETED_PENDING_REVIEW',
        'CLOSED',
        'REOPENED',
        'BLOCKED',
        'CANCELLED'
      )
  ) THEN
    RAISE EXCEPTION
      'P8-C found an unsupported legacy Work status. Review the status mapping before migrating.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" = 'CLOSED'
      AND "closed_at" IS NULL
  ) THEN
    RAISE EXCEPTION
      'P8-C found CLOSED legacy Work without closed_at.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" = 'CANCELLED'
      AND "cancelled_at" IS NULL
  ) THEN
    RAISE EXCEPTION
      'P8-C found CANCELLED legacy Work without cancelled_at.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    LEFT JOIN "work_stage_definitions" stage_definition
      ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
     AND stage_definition."code" = 'EXECUTION'
    WHERE work_item."status" <> 'V3_RUNTIME'
    GROUP BY work_item."id"
    HAVING COUNT(stage_definition."id") <> 1
  ) THEN
    RAISE EXCEPTION
      'P8-C requires exactly one EXECUTION definition for every legacy Work Type Version.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    JOIN "work_stage_definitions" stage_definition
      ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
     AND stage_definition."code" = 'EXECUTION'
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND stage_definition."responsible_org_unit_rule" <> 'PRIMARY_OWNER'
  ) THEN
    RAISE EXCEPTION
      'P8-C expected every initial Technical EXECUTION stage to use PRIMARY_OWNER responsibility.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    JOIN "work_stage_definitions" stage_definition
      ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
     AND stage_definition."code" = 'EXECUTION'
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND stage_definition."assignment_mode" NOT IN ('TEAM', 'ORG_UNIT_OR_USER')
  ) THEN
    RAISE EXCEPTION
      'P8-C found an unexpected initial Technical EXECUTION assignment mode.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND NOT EXISTS (
        SELECT 1
        FROM "work_org_unit_participants" participant
        WHERE participant."work_item_id" = work_item."id"
          AND participant."org_unit_id" = work_item."primary_owner_org_unit_id"
          AND participant."role" = 'PRIMARY_OWNER'
          AND participant."ended_at" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-C requires the Phase 6 active PRIMARY_OWNER participant reconciliation.';
  END IF;

  -- Phase 8 starts with no legacy execution runtime stages. Stop rather than
  -- silently merge an unknown partial/manual projection.
  IF EXISTS (
    SELECT 1
    FROM "work_stages" stage
    JOIN "work_items" work_item
      ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) THEN
    RAISE EXCEPTION
      'P8-C found pre-existing runtime stages on legacy Work. Reconcile them before applying this migration.';
  END IF;

  -- Any explicit legacy Team assignment must already have the controlled
  -- LegacyOrgUnitMapping produced by the hierarchy migration, and P6-D must
  -- have used that mapped Team as the Work Primary Owner.
  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    LEFT JOIN "legacy_org_unit_mappings" team_mapping
      ON team_mapping."legacy_entity_type" = 'TEAM'
     AND team_mapping."legacy_entity_id" = work_item."assigned_team_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."assigned_team_id" IS NOT NULL
      AND (
        team_mapping."org_unit_id" IS NULL
        OR team_mapping."office_id" <> work_item."office_id"
        OR team_mapping."org_unit_id" <> work_item."primary_owner_org_unit_id"
      )
  ) THEN
    RAISE EXCEPTION
      'P8-C legacy Team mapping no longer matches the Phase 6 Primary Owner resolution.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    JOIN "work_stage_definitions" stage_definition
      ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
     AND stage_definition."code" = 'EXECUTION'
    JOIN "org_units" owner_unit
      ON owner_unit."id" = work_item."primary_owner_org_unit_id"
    JOIN "org_unit_types" owner_type
      ON owner_type."id" = owner_unit."org_unit_type_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."assigned_team_id" IS NOT NULL
      AND stage_definition."assignment_mode" = 'TEAM'
      AND owner_type."is_team" = false
  ) THEN
    RAISE EXCEPTION
      'P8-C cannot project a legacy assigned Team because its mapped Primary Owner is not a V3 Team.';
  END IF;

  CREATE TEMP TABLE p8c_execution_projection ON COMMIT DROP AS
  SELECT
    work_item."id" AS work_item_id,
    work_item."office_id" AS office_id,
    work_item."work_type_version_id" AS work_type_version_id,
    work_item."primary_owner_org_unit_id" AS responsible_org_unit_id,
    work_item."status" AS legacy_status,
    work_item."created_by_account_id" AS created_by_account_id,
    work_item."assigned_team_id" AS assigned_team_id,
    stage_definition."id" AS stage_definition_id,
    stage_definition."code" AS code,
    stage_definition."name" AS name,
    stage_definition."sort_order" AS sort_order,
    stage_definition."is_required" AS is_required,
    stage_definition."assignment_mode" AS assignment_mode,
    stage_definition."approval_mode" AS approval_mode,
    stage_definition."approval_leadership_type" AS approval_leadership_type,
    stage_definition."activation_mode" AS activation_mode,
    activation_field."code" AS activation_field_code,
    stage_definition."activation_expected_value" AS activation_expected_value,
    stage_definition."sla_minutes" AS sla_minutes,
    CASE work_item."status"
      WHEN 'ASSIGNED' THEN 'READY'::"WorkStageStatus"
      WHEN 'ACKNOWLEDGED' THEN 'READY'::"WorkStageStatus"
      WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::"WorkStageStatus"
      WHEN 'HELP_REQUESTED' THEN 'BLOCKED'::"WorkStageStatus"
      WHEN 'COMPLETED_PENDING_REVIEW' THEN 'SUBMITTED'::"WorkStageStatus"
      WHEN 'CLOSED' THEN 'COMPLETED'::"WorkStageStatus"
      WHEN 'REOPENED' THEN 'IN_PROGRESS'::"WorkStageStatus"
      WHEN 'BLOCKED' THEN 'BLOCKED'::"WorkStageStatus"
      WHEN 'CANCELLED' THEN 'CANCELLED'::"WorkStageStatus"
    END AS stage_status,
    work_item."due_at" AS due_at,
    COALESCE(
      work_item."opened_at",
      work_item."registered_at",
      work_item."created_at"
    ) AS ready_at,
    COALESCE(
      (
        SELECT MIN(assignment_record."started_at")
        FROM "work_assignments" assignment_record
        WHERE assignment_record."work_item_id" = work_item."id"
          AND assignment_record."started_at" IS NOT NULL
      ),
      (
        SELECT MIN(activity."created_at")
        FROM "work_activities" activity
        WHERE activity."work_item_id" = work_item."id"
          AND activity."action" = 'STARTED'
      )
    ) AS started_at,
    CASE
      WHEN work_item."status" = 'COMPLETED_PENDING_REVIEW' THEN COALESCE(
        (
          SELECT MAX(activity."created_at")
          FROM "work_activities" activity
          WHERE activity."work_item_id" = work_item."id"
            AND activity."action" = 'COMPLETION_SUBMITTED'
        ),
        work_item."completed_at",
        work_item."updated_at"
      )
      ELSE NULL
    END AS submitted_at,
    CASE
      WHEN work_item."status" = 'CLOSED' THEN work_item."closed_at"
      ELSE NULL
    END AS completed_at,
    CASE
      WHEN work_item."status" IN ('HELP_REQUESTED', 'BLOCKED') THEN COALESCE(
        (
          SELECT MAX(activity."created_at")
          FROM "work_activities" activity
          WHERE activity."work_item_id" = work_item."id"
            AND (
              activity."action" = 'HELP_REQUESTED'
              OR activity."to_status" = 'BLOCKED'
            )
        ),
        work_item."updated_at"
      )
      ELSE NULL
    END AS blocked_at,
    CASE
      WHEN work_item."status" = 'CANCELLED' THEN work_item."cancelled_at"
      ELSE NULL
    END AS cancelled_at,
    CASE
      WHEN work_item."status" IN ('HELP_REQUESTED', 'BLOCKED') THEN
        CASE
          WHEN COALESCE(
            (
              SELECT MIN(assignment_record."started_at")
              FROM "work_assignments" assignment_record
              WHERE assignment_record."work_item_id" = work_item."id"
                AND assignment_record."started_at" IS NOT NULL
            ),
            (
              SELECT MIN(activity."created_at")
              FROM "work_activities" activity
              WHERE activity."work_item_id" = work_item."id"
                AND activity."action" = 'STARTED'
            )
          ) IS NULL
            THEN 'READY'::"WorkStageStatus"
          ELSE 'IN_PROGRESS'::"WorkStageStatus"
        END
      ELSE NULL
    END AS blocked_from_status,
    CASE
      WHEN work_item."status" = 'HELP_REQUESTED'
        THEN 'Projected from legacy HELP_REQUESTED state; detailed Help history remains authoritative in work_help_requests.'
      WHEN work_item."status" = 'BLOCKED'
        THEN 'Projected from legacy BLOCKED state.'
      ELSE NULL
    END AS blocker_reason,
    work_item."created_at" AS work_created_at
  FROM "work_items" work_item
  JOIN "work_stage_definitions" stage_definition
    ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
   AND stage_definition."code" = 'EXECUTION'
  LEFT JOIN "work_field_definitions" activation_field
    ON activation_field."id" = stage_definition."activation_field_definition_id"
  WHERE work_item."status" <> 'V3_RUNTIME';

  IF (SELECT COUNT(*) FROM p8c_execution_projection) <> legacy_work_count THEN
    RAISE EXCEPTION
      'P8-C execution projection count does not match legacy Work count.';
  END IF;

  INSERT INTO "work_stages" (
    "id",
    "work_item_id",
    "stage_definition_id",
    "responsible_org_unit_id",
    "code",
    "name",
    "sort_order",
    "is_required",
    "assignment_mode",
    "approval_mode",
    "approval_leadership_type",
    "activation_mode",
    "activation_field_code",
    "activation_expected_value",
    "sla_minutes",
    "status",
    "version",
    "blocked_from_status",
    "blocker_reason",
    "due_at",
    "ready_at",
    "started_at",
    "submitted_at",
    "completed_at",
    "blocked_at",
    "cancelled_at",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.stage_definition_id,
    projection.responsible_org_unit_id,
    projection.code,
    projection.name,
    projection.sort_order,
    projection.is_required,
    projection.assignment_mode,
    projection.approval_mode,
    projection.approval_leadership_type,
    projection.activation_mode,
    projection.activation_field_code,
    projection.activation_expected_value,
    projection.sla_minutes,
    projection.stage_status,
    1,
    projection.blocked_from_status,
    projection.blocker_reason,
    projection.due_at,
    projection.ready_at,
    projection.started_at,
    projection.submitted_at,
    projection.completed_at,
    projection.blocked_at,
    projection.cancelled_at,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM p8c_execution_projection projection;

  SELECT COUNT(*)
  INTO projected_stage_count
  FROM "work_items" work_item
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND EXISTS (
      SELECT 1
      FROM "work_stages" stage
      WHERE stage."work_item_id" = work_item."id"
        AND stage."code" = 'EXECUTION'
        AND stage."stage_definition_id" IN (
          SELECT stage_definition."id"
          FROM "work_stage_definitions" stage_definition
          WHERE stage_definition."work_type_version_id" = work_item."work_type_version_id"
            AND stage_definition."code" = 'EXECUTION'
        )
    );

  IF projected_stage_count <> legacy_work_count THEN
    RAISE EXCEPTION
      'P8-C failed to create exactly one compatible EXECUTION runtime stage for every legacy Work.';
  END IF;

  -- Resolve deterministic OrgUnit participation from each assignee's active
  -- PRIMARY membership. Supporting assignees and legacy PRIMARY assignees that
  -- sit outside the Work owner subtree become SUPPORTING_PARTICIPANT evidence.
  CREATE TEMP TABLE p8c_supporting_participant_projection ON COMMIT DROP AS
  SELECT DISTINCT ON (work_item."id", membership."org_unit_id")
    work_item."id" AS work_item_id,
    membership."org_unit_id" AS org_unit_id,
    assignment_record."id" AS legacy_assignment_id,
    assignment_record."assignment_role" AS legacy_assignment_role,
    assignment_record."assigned_by_account_id" AS added_by_account_id,
    assignment_record."created_at" AS started_at
  FROM "work_assignments" assignment_record
  JOIN "work_items" work_item
    ON work_item."id" = assignment_record."work_item_id"
  JOIN "accounts" assignee
    ON assignee."id" = assignment_record."assignee_account_id"
  JOIN "org_memberships" membership
    ON membership."employee_id" = assignee."employee_id"
   AND membership."office_id" = work_item."office_id"
   AND membership."membership_type" = 'PRIMARY'
   AND membership."ends_at" IS NULL
   AND membership."org_unit_id" IS NOT NULL
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND membership."org_unit_id" <> work_item."primary_owner_org_unit_id"
    AND (
      assignment_record."assignment_role" = 'SUPPORTING'
      OR NOT EXISTS (
        SELECT 1
        FROM "org_unit_closure" closure
        WHERE closure."ancestor_org_unit_id" = work_item."primary_owner_org_unit_id"
          AND closure."descendant_org_unit_id" = membership."org_unit_id"
      )
    )
  ORDER BY
    work_item."id",
    membership."org_unit_id",
    assignment_record."created_at",
    assignment_record."id";

  INSERT INTO "work_org_unit_participants" (
    "id",
    "work_item_id",
    "org_unit_id",
    "role",
    "added_by_account_id",
    "started_at",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.org_unit_id,
    'SUPPORTING_PARTICIPANT'::"WorkParticipantRole",
    projection.added_by_account_id,
    projection.started_at,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM p8c_supporting_participant_projection projection
  WHERE NOT EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" participant
    WHERE participant."work_item_id" = projection.work_item_id
      AND participant."org_unit_id" = projection.org_unit_id
      AND participant."ended_at" IS NULL
      AND participant."role" <> 'OBSERVER'
  );

  SELECT COUNT(*)
  INTO projected_participant_count
  FROM p8c_supporting_participant_projection projection
  WHERE EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" participant
    WHERE participant."work_item_id" = projection.work_item_id
      AND participant."org_unit_id" = projection.org_unit_id
      AND participant."ended_at" IS NULL
      AND participant."role" <> 'OBSERVER'
  );

  IF projected_participant_count <>
     (SELECT COUNT(*) FROM p8c_supporting_participant_projection) THEN
    RAISE EXCEPTION
      'P8-C could not reconcile every deterministic supporting OrgUnit participant projection.';
  END IF;

  INSERT INTO "work_events" (
    "id",
    "work_item_id",
    "work_stage_id",
    "actor_account_id",
    "event_type",
    "from_work_status",
    "to_work_status",
    "from_stage_status",
    "to_stage_status",
    "details",
    "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    NULL,
    projection.added_by_account_id,
    'PARTICIPANT_ADDED'::"WorkEventType",
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_ASSIGNMENT_PARTICIPANT_BACKFILL',
      'phase', 'P8_C',
      'legacyAssignmentId', projection.legacy_assignment_id::text,
      'legacyAssignmentRole', projection.legacy_assignment_role::text,
      'orgUnitId', projection.org_unit_id::text,
      'role', 'SUPPORTING_PARTICIPANT'
    ),
    projection.started_at
  FROM p8c_supporting_participant_projection projection
  WHERE NOT EXISTS (
    SELECT 1
    FROM "work_events" existing_event
    WHERE existing_event."work_item_id" = projection.work_item_id
      AND existing_event."event_type" = 'PARTICIPANT_ADDED'
      AND existing_event."details" ->> 'source' = 'WM_V2_ASSIGNMENT_PARTICIPANT_BACKFILL'
      AND existing_event."details" ->> 'orgUnitId' = projection.org_unit_id::text
  );

  -- Determine the subset of current legacy PRIMARY assignments that can be
  -- represented as a real V3 stage assignment without bypassing V3 integrity.
  --
  -- TEAM mode: only an explicit legacy assigned_team_id is accepted, and P6-D
  -- already proved that its mapped Team is the Work Primary Owner.
  --
  -- ORG_UNIT_OR_USER: explicit legacy Team ownership is represented as the
  -- responsible OrgUnit queue. Without a Team, a direct account target is used
  -- only when the account has an effective in-scope membership at a safe
  -- projection time. The true legacy timestamp remains in the history event.
  CREATE TEMP TABLE p8c_runtime_primary_assignment_projection ON COMMIT DROP AS
  WITH legacy_primary AS (
    SELECT
      assignment_record."id" AS legacy_assignment_id,
      assignment_record."work_item_id" AS work_item_id,
      assignment_record."assignee_account_id" AS assignee_account_id,
      assignment_record."assigned_by_account_id" AS assigned_by_account_id,
      assignment_record."created_at" AS legacy_starts_at,
      work_item."status" AS legacy_status,
      work_item."office_id" AS office_id,
      work_item."primary_owner_org_unit_id" AS responsible_org_unit_id,
      work_item."assigned_team_id" AS assigned_team_id,
      work_item."closed_at" AS closed_at,
      work_item."cancelled_at" AS cancelled_at,
      stage."id" AS work_stage_id,
      stage."assignment_mode" AS assignment_mode,
      assignee."employee_id" AS assignee_employee_id
    FROM "work_assignments" assignment_record
    JOIN "work_items" work_item
      ON work_item."id" = assignment_record."work_item_id"
    JOIN "work_stages" stage
      ON stage."work_item_id" = work_item."id"
     AND stage."code" = 'EXECUTION'
    JOIN "accounts" assignee
      ON assignee."id" = assignment_record."assignee_account_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND assignment_record."assignment_role" = 'PRIMARY'
      AND assignment_record."ended_at" IS NULL
  ),
  with_membership AS (
    SELECT
      legacy_primary.*,
      eligible_membership."starts_at" AS membership_starts_at
    FROM legacy_primary
    LEFT JOIN LATERAL (
      SELECT membership."starts_at"
      FROM "org_memberships" membership
      JOIN "org_unit_closure" closure
        ON closure."descendant_org_unit_id" = membership."org_unit_id"
      WHERE membership."employee_id" = legacy_primary.assignee_employee_id
        AND membership."office_id" = legacy_primary.office_id
        AND membership."org_unit_id" IS NOT NULL
        AND closure."ancestor_org_unit_id" = legacy_primary.responsible_org_unit_id
        AND membership."ends_at" IS NULL
      ORDER BY membership."starts_at", membership."id"
      LIMIT 1
    ) eligible_membership ON true
  )
  SELECT
    with_membership.legacy_assignment_id,
    with_membership.work_item_id,
    with_membership.work_stage_id,
    'TEAM'::"WorkStageAssignmentTargetType" AS target_type,
    with_membership.responsible_org_unit_id AS target_org_unit_id,
    NULL::UUID AS target_account_id,
    with_membership.assigned_by_account_id,
    with_membership.legacy_starts_at AS starts_at,
    CASE
      WHEN with_membership.legacy_status = 'CANCELLED'
        THEN with_membership.cancelled_at
      ELSE NULL
    END AS ends_at,
    CASE
      WHEN with_membership.legacy_status = 'CANCELLED' THEN (
        SELECT activity."actor_account_id"
        FROM "work_activities" activity
        WHERE activity."work_item_id" = with_membership.work_item_id
          AND activity."action" = 'CANCELLED'
        ORDER BY activity."created_at" DESC, activity."id" DESC
        LIMIT 1
      )
      ELSE NULL
    END AS ended_by_account_id,
    'TEAM_RUNTIME_ASSIGNMENT'::text AS projection_kind
  FROM with_membership
  WHERE with_membership.assignment_mode = 'TEAM'
    AND with_membership.assigned_team_id IS NOT NULL
    AND (
      with_membership.legacy_status <> 'CANCELLED'
      OR with_membership.legacy_starts_at <= with_membership.cancelled_at
    )

  UNION ALL

  SELECT
    with_membership.legacy_assignment_id,
    with_membership.work_item_id,
    with_membership.work_stage_id,
    'ORG_UNIT_QUEUE'::"WorkStageAssignmentTargetType" AS target_type,
    with_membership.responsible_org_unit_id AS target_org_unit_id,
    NULL::UUID AS target_account_id,
    with_membership.assigned_by_account_id,
    with_membership.legacy_starts_at AS starts_at,
    CASE
      WHEN with_membership.legacy_status = 'CANCELLED'
        THEN with_membership.cancelled_at
      ELSE NULL
    END AS ends_at,
    CASE
      WHEN with_membership.legacy_status = 'CANCELLED' THEN (
        SELECT activity."actor_account_id"
        FROM "work_activities" activity
        WHERE activity."work_item_id" = with_membership.work_item_id
          AND activity."action" = 'CANCELLED'
        ORDER BY activity."created_at" DESC, activity."id" DESC
        LIMIT 1
      )
      ELSE NULL
    END AS ended_by_account_id,
    'ORG_UNIT_QUEUE_RUNTIME_ASSIGNMENT'::text AS projection_kind
  FROM with_membership
  WHERE with_membership.assignment_mode = 'ORG_UNIT_OR_USER'
    AND with_membership.assigned_team_id IS NOT NULL
    AND (
      with_membership.legacy_status <> 'CANCELLED'
      OR with_membership.legacy_starts_at <= with_membership.cancelled_at
    )

  UNION ALL

  SELECT
    with_membership.legacy_assignment_id,
    with_membership.work_item_id,
    with_membership.work_stage_id,
    'ACCOUNT'::"WorkStageAssignmentTargetType" AS target_type,
    NULL::UUID AS target_org_unit_id,
    with_membership.assignee_account_id AS target_account_id,
    with_membership.assigned_by_account_id,
    GREATEST(
      with_membership.legacy_starts_at,
      with_membership.membership_starts_at
    ) AS starts_at,
    CASE
      WHEN with_membership.legacy_status = 'CANCELLED'
        THEN with_membership.cancelled_at
      ELSE NULL
    END AS ends_at,
    CASE
      WHEN with_membership.legacy_status = 'CANCELLED' THEN (
        SELECT activity."actor_account_id"
        FROM "work_activities" activity
        WHERE activity."work_item_id" = with_membership.work_item_id
          AND activity."action" = 'CANCELLED'
        ORDER BY activity."created_at" DESC, activity."id" DESC
        LIMIT 1
      )
      ELSE NULL
    END AS ended_by_account_id,
    'ACCOUNT_RUNTIME_ASSIGNMENT'::text AS projection_kind
  FROM with_membership
  WHERE with_membership.assignment_mode = 'ORG_UNIT_OR_USER'
    AND with_membership.assigned_team_id IS NULL
    AND with_membership.membership_starts_at IS NOT NULL
    AND (
      with_membership.legacy_status NOT IN ('CLOSED', 'CANCELLED')
      OR GREATEST(
           with_membership.legacy_starts_at,
           with_membership.membership_starts_at
         ) <= CASE
           WHEN with_membership.legacy_status = 'CLOSED'
             THEN with_membership.closed_at
           ELSE with_membership.cancelled_at
         END
    );

  SELECT COUNT(*)
  INTO runtime_assignment_candidate_count
  FROM p8c_runtime_primary_assignment_projection;

  IF EXISTS (
    SELECT legacy_assignment_id
    FROM p8c_runtime_primary_assignment_projection
    GROUP BY legacy_assignment_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'P8-C produced more than one runtime assignment projection for one legacy PRIMARY assignment.';
  END IF;

  INSERT INTO "work_stage_assignments" (
    "id",
    "work_stage_id",
    "target_type",
    "target_org_unit_id",
    "target_account_id",
    "assignment_role",
    "assigned_by_account_id",
    "ended_by_account_id",
    "assignment_reason",
    "end_reason",
    "starts_at",
    "ends_at",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_stage_id,
    projection.target_type,
    projection.target_org_unit_id,
    projection.target_account_id,
    'PRIMARY'::"WorkStageAssignmentRole",
    projection.assigned_by_account_id,
    projection.ended_by_account_id,
    'WM-V2 PRIMARY assignment ' || projection.legacy_assignment_id::text || ' compatibility projection.',
    CASE
      WHEN projection.ends_at IS NOT NULL
        THEN 'WM-V2 Work cancellation compatibility projection.'
      ELSE NULL
    END,
    projection.starts_at,
    projection.ends_at,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM p8c_runtime_primary_assignment_projection projection;

  SELECT COUNT(*)
  INTO runtime_assignment_projected_count
  FROM p8c_runtime_primary_assignment_projection projection
  WHERE EXISTS (
    SELECT 1
    FROM "work_stage_assignments" stage_assignment
    WHERE stage_assignment."work_stage_id" = projection.work_stage_id
      AND stage_assignment."assignment_role" = 'PRIMARY'
      AND stage_assignment."assignment_reason" =
        'WM-V2 PRIMARY assignment ' || projection.legacy_assignment_id::text || ' compatibility projection.'
  );

  IF runtime_assignment_projected_count <> runtime_assignment_candidate_count THEN
    RAISE EXCEPTION
      'P8-C runtime assignment reconciliation failed: expected %, found %.',
      runtime_assignment_candidate_count,
      runtime_assignment_projected_count;
  END IF;

  -- Stage-ready snapshot for every projected legacy execution stage.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    stage."id",
    projection.created_by_account_id,
    'STAGE_READY'::"WorkEventType",
    NULL,
    NULL,
    'PENDING'::"WorkStageStatus",
    'READY'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_EXECUTION_STAGE_BACKFILL',
      'phase', 'P8_C',
      'transition', 'READY',
      'legacyStatus', projection.legacy_status::text,
      'compatibilitySnapshot', true
    ),
    projection.ready_at
  FROM p8c_execution_projection projection
  JOIN "work_stages" stage
    ON stage."work_item_id" = projection.work_item_id
   AND stage."stage_definition_id" = projection.stage_definition_id;

  -- Preserve one concrete stage-start transition when legacy execution evidence
  -- exists. Per-assignee started/acknowledged timestamps remain in assignment
  -- history events below.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    stage."id",
    COALESCE(
      (
        SELECT activity."actor_account_id"
        FROM "work_activities" activity
        WHERE activity."work_item_id" = projection.work_item_id
          AND activity."action" = 'STARTED'
        ORDER BY activity."created_at", activity."id"
        LIMIT 1
      ),
      (
        SELECT assignment_record."assignee_account_id"
        FROM "work_assignments" assignment_record
        WHERE assignment_record."work_item_id" = projection.work_item_id
          AND assignment_record."assignment_role" = 'PRIMARY'
        ORDER BY assignment_record."created_at", assignment_record."id"
        LIMIT 1
      )
    ),
    'STAGE_STARTED'::"WorkEventType",
    NULL,
    NULL,
    'READY'::"WorkStageStatus",
    'IN_PROGRESS'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_EXECUTION_STAGE_BACKFILL',
      'phase', 'P8_C',
      'transition', 'STARTED',
      'compatibilitySnapshot', true
    ),
    projection.started_at
  FROM p8c_execution_projection projection
  JOIN "work_stages" stage
    ON stage."work_item_id" = projection.work_item_id
   AND stage."stage_definition_id" = projection.stage_definition_id
  WHERE projection.started_at IS NOT NULL;

  -- Preserve current legacy blocked/help-waiting state without inventing Help
  -- request details; P8-D migrates the request/response domain itself.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    stage."id",
    (
      SELECT activity."actor_account_id"
      FROM "work_activities" activity
      WHERE activity."work_item_id" = projection.work_item_id
        AND (
          activity."action" = 'HELP_REQUESTED'
          OR activity."to_status" = 'BLOCKED'
        )
      ORDER BY activity."created_at" DESC, activity."id" DESC
      LIMIT 1
    ),
    'STAGE_BLOCKED'::"WorkEventType",
    NULL,
    NULL,
    projection.blocked_from_status,
    'BLOCKED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_EXECUTION_STAGE_BACKFILL',
      'phase', 'P8_C',
      'transition', 'BLOCKED',
      'legacyStatus', projection.legacy_status::text,
      'compatibilitySnapshot', true
    ),
    projection.blocked_at
  FROM p8c_execution_projection projection
  JOIN "work_stages" stage
    ON stage."work_item_id" = projection.work_item_id
   AND stage."stage_definition_id" = projection.stage_definition_id
  WHERE projection.stage_status = 'BLOCKED';

  -- A legacy item currently waiting for completion review is represented as a
  -- SUBMITTED stage snapshot. The immutable WorkStageSubmission/Approval rows
  -- are deliberately migrated in P8-E with the full completion package.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    stage."id",
    (
      SELECT activity."actor_account_id"
      FROM "work_activities" activity
      WHERE activity."work_item_id" = projection.work_item_id
        AND activity."action" = 'COMPLETION_SUBMITTED'
      ORDER BY activity."created_at" DESC, activity."id" DESC
      LIMIT 1
    ),
    'STAGE_SUBMITTED'::"WorkEventType",
    NULL,
    NULL,
    CASE
      WHEN projection.started_at IS NULL
        THEN 'READY'::"WorkStageStatus"
      ELSE 'IN_PROGRESS'::"WorkStageStatus"
    END,
    'SUBMITTED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_EXECUTION_STAGE_BACKFILL',
      'phase', 'P8_C',
      'transition', 'SUBMITTED',
      'compatibilitySnapshot', true,
      'fullCompletionHistoryDeferredTo', 'P8_E'
    ),
    projection.submitted_at
  FROM p8c_execution_projection projection
  JOIN "work_stages" stage
    ON stage."work_item_id" = projection.work_item_id
   AND stage."stage_definition_id" = projection.stage_definition_id
  WHERE projection.stage_status = 'SUBMITTED';

  -- Preserve every legacy person assignment as an authoritative V3 timeline
  -- event, even when the V3 stage-assignment integrity model correctly prevents
  -- a direct runtime assignment from being created.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    assignment_record."work_item_id",
    stage."id",
    assignment_record."assigned_by_account_id",
    'STAGE_ASSIGNED'::"WorkEventType",
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_ASSIGNMENT_HISTORY',
      'phase', 'P8_C',
      'legacyAssignmentId', assignment_record."id"::text,
      'legacyAssignmentRole', assignment_record."assignment_role"::text,
      'legacyAssigneeAccountId', assignment_record."assignee_account_id"::text,
      'legacyAssignedByAccountId', assignment_record."assigned_by_account_id"::text,
      'acknowledgedAt', assignment_record."acknowledged_at",
      'startedAt', assignment_record."started_at",
      'endedAt', assignment_record."ended_at",
      'endReason', assignment_record."end_reason",
      'legacyAssignedTeamId', work_item."assigned_team_id",
      'projectionKind', COALESCE(runtime_projection.projection_kind, 'HISTORY_ONLY'),
      'compatibilitySnapshot', true
    ),
    assignment_record."created_at"
  FROM "work_assignments" assignment_record
  JOIN "work_items" work_item
    ON work_item."id" = assignment_record."work_item_id"
  JOIN "work_stages" stage
    ON stage."work_item_id" = work_item."id"
   AND stage."code" = 'EXECUTION'
  LEFT JOIN p8c_runtime_primary_assignment_projection runtime_projection
    ON runtime_projection.legacy_assignment_id = assignment_record."id"
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND NOT EXISTS (
      SELECT 1
      FROM "work_events" existing_event
      WHERE existing_event."work_item_id" = assignment_record."work_item_id"
        AND existing_event."event_type" = 'STAGE_ASSIGNED'
        AND existing_event."details" ->> 'source' = 'WM_V2_ASSIGNMENT_HISTORY'
        AND existing_event."details" ->> 'legacyAssignmentId' = assignment_record."id"::text
    );

  SELECT COUNT(*)
  INTO projected_assignment_event_count
  FROM "work_assignments" assignment_record
  JOIN "work_items" work_item
    ON work_item."id" = assignment_record."work_item_id"
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND EXISTS (
      SELECT 1
      FROM "work_events" event_record
      WHERE event_record."work_item_id" = assignment_record."work_item_id"
        AND event_record."event_type" = 'STAGE_ASSIGNED'
        AND event_record."details" ->> 'source' = 'WM_V2_ASSIGNMENT_HISTORY'
        AND event_record."details" ->> 'legacyAssignmentId' = assignment_record."id"::text
    );

  IF projected_assignment_event_count <> legacy_assignment_count THEN
    RAISE EXCEPTION
      'P8-C assignment-history reconciliation failed: expected %, found %.',
      legacy_assignment_count,
      projected_assignment_event_count;
  END IF;

  -- Terminal execution state is derived from the current Work status and its
  -- canonical terminal timestamp, not merely from the existence of an older
  -- CLOSED/CANCELLED activity. This preserves reopened-then-cancelled history.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    stage."id",
    (
      SELECT activity."actor_account_id"
      FROM "work_activities" activity
      WHERE activity."work_item_id" = projection.work_item_id
        AND activity."action" = 'CLOSED'
      ORDER BY activity."created_at" DESC, activity."id" DESC
      LIMIT 1
    ),
    'STAGE_COMPLETED'::"WorkEventType",
    NULL,
    NULL,
    CASE
      WHEN projection.started_at IS NULL
        THEN 'READY'::"WorkStageStatus"
      ELSE 'IN_PROGRESS'::"WorkStageStatus"
    END,
    'COMPLETED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_EXECUTION_STAGE_BACKFILL',
      'phase', 'P8_C',
      'transition', 'COMPLETED',
      'legacyStatus', projection.legacy_status::text,
      'compatibilitySnapshot', true,
      'fullCompletionHistoryDeferredTo', 'P8_E'
    ),
    projection.completed_at
  FROM p8c_execution_projection projection
  JOIN "work_stages" stage
    ON stage."work_item_id" = projection.work_item_id
   AND stage."stage_definition_id" = projection.stage_definition_id
  WHERE projection.stage_status = 'COMPLETED';

  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    stage."id",
    (
      SELECT activity."actor_account_id"
      FROM "work_activities" activity
      WHERE activity."work_item_id" = projection.work_item_id
        AND activity."action" = 'CANCELLED'
      ORDER BY activity."created_at" DESC, activity."id" DESC
      LIMIT 1
    ),
    'STAGE_CANCELLED'::"WorkEventType",
    NULL,
    NULL,
    CASE
      WHEN projection.started_at IS NULL
        THEN 'READY'::"WorkStageStatus"
      ELSE 'IN_PROGRESS'::"WorkStageStatus"
    END,
    'CANCELLED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_EXECUTION_STAGE_BACKFILL',
      'phase', 'P8_C',
      'transition', 'CANCELLED',
      'legacyStatus', projection.legacy_status::text,
      'compatibilitySnapshot', true
    ),
    projection.cancelled_at
  FROM p8c_execution_projection projection
  JOIN "work_stages" stage
    ON stage."work_item_id" = projection.work_item_id
   AND stage."stage_definition_id" = projection.stage_definition_id
  WHERE projection.stage_status = 'CANCELLED';

  -- Final safety gates for the P8-C projection.
  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND NOT EXISTS (
        SELECT 1
        FROM "work_stages" stage
        WHERE stage."work_item_id" = work_item."id"
          AND stage."code" = 'EXECUTION'
      )
  ) THEN
    RAISE EXCEPTION
      'P8-C left at least one legacy Work without an EXECUTION runtime stage.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_assignments" stage_assignment
    JOIN "work_stages" stage
      ON stage."id" = stage_assignment."work_stage_id"
    JOIN "work_items" work_item
      ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND stage_assignment."assignment_reason" LIKE 'WM-V2 PRIMARY assignment % compatibility projection.'
      AND stage."assignment_mode" = 'TEAM'
      AND stage_assignment."target_type" <> 'TEAM'
  ) THEN
    RAISE EXCEPTION
      'P8-C created a non-Team target for a TEAM-mode legacy execution stage.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_assignments" stage_assignment
    JOIN "work_stages" stage
      ON stage."id" = stage_assignment."work_stage_id"
    JOIN "work_items" work_item
      ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND stage_assignment."assignment_reason" LIKE 'WM-V2 PRIMARY assignment % compatibility projection.'
      AND stage_assignment."target_type" = 'ACCOUNT'
      AND NOT EXISTS (
        SELECT 1
        FROM "accounts" account
        JOIN "org_memberships" membership
          ON membership."employee_id" = account."employee_id"
        JOIN "org_unit_closure" closure
          ON closure."descendant_org_unit_id" = membership."org_unit_id"
        WHERE account."id" = stage_assignment."target_account_id"
          AND membership."office_id" = work_item."office_id"
          AND closure."ancestor_org_unit_id" = stage."responsible_org_unit_id"
          AND membership."starts_at" <= stage_assignment."starts_at"
          AND (
            membership."ends_at" IS NULL
            OR membership."ends_at" > stage_assignment."starts_at"
          )
      )
  ) THEN
    RAISE EXCEPTION
      'P8-C created an account assignment outside the responsible OrgUnit effective scope.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_assignments" stage_assignment
    JOIN "work_stages" stage
      ON stage."id" = stage_assignment."work_stage_id"
    JOIN "work_items" work_item
      ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" = 'CANCELLED'
      AND stage_assignment."assignment_reason" LIKE 'WM-V2 PRIMARY assignment % compatibility projection.'
      AND (
        stage_assignment."ends_at" IS NULL
        OR stage_assignment."ends_at" <> work_item."cancelled_at"
        OR stage_assignment."end_reason" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-C cancellation projection left a migrated active assignment or missing end reason.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_items" WHERE "status" <> 'V3_RUNTIME') <> legacy_work_count THEN
    RAISE EXCEPTION
      'P8-C unexpectedly changed the legacy Work row count.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_assignments" assignment_record
    JOIN "work_items" work_item
      ON work_item."id" = assignment_record."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) <> legacy_assignment_count THEN
    RAISE EXCEPTION
      'P8-C unexpectedly changed the legacy Work assignment row count.';
  END IF;
END $$;
