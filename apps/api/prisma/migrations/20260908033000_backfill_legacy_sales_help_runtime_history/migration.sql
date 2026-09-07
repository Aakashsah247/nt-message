-- Phase 8 / P8-D: generalize legacy WM-V2 Sales coordination and Help history
-- into Work Runtime V3 compatibility structures.
--
-- This migration remains additive and evidence-preserving:
--   * the legacy Sales member/status/timestamps, messages and attachments remain;
--   * the legacy Help request rows and WorkActivity rows remain authoritative;
--   * every legacy Sales-linked Work receives its configured SALES_COORDINATION
--     runtime stage and a REQUIRED_PARTICIPANT Sales OrgUnit history record;
--   * a direct Sales account stage assignment is created only when the account
--     had an effective membership inside the configured Sales OrgUnit scope
--     during the proven legacy Sales coordination interval;
--   * Sales assignments that cannot satisfy V3 scope integrity are represented
--     as HISTORY_ONLY stage-assignment events instead of weakening authorization;
--   * current legacy Help rows have no requested department/helper evidence, so
--     they are preserved as history-only V3 Work events rather than fabricating
--     a receiving OrgUnit or a WorkCollaborationRequest.
--
-- P8-E remains responsible for immutable completion submission/approval package
-- migration. Reports V2 remains legacy-only until the dedicated Reports V3 phase.

DO $$
DECLARE
  legacy_sales_work_count INTEGER;
  legacy_sales_message_count INTEGER;
  legacy_sales_attachment_count INTEGER;
  legacy_help_request_count INTEGER;
  legacy_work_activity_count INTEGER;

  projected_sales_stage_count INTEGER;
  projected_sales_participant_count INTEGER;
  projected_sales_assignment_event_count INTEGER;
  projected_sales_runtime_assignment_count INTEGER;
  projected_help_request_event_count INTEGER;
  projected_help_response_event_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO legacy_sales_work_count
  FROM "work_items"
  WHERE "status" <> 'V3_RUNTIME'
    AND "sales_member_account_id" IS NOT NULL;

  SELECT COUNT(*) INTO legacy_sales_message_count
  FROM "work_sales_messages";

  SELECT COUNT(*) INTO legacy_sales_attachment_count
  FROM "work_sales_attachments";

  SELECT COUNT(*) INTO legacy_help_request_count
  FROM "work_help_requests" help_request
  JOIN "work_items" work_item
    ON work_item."id" = help_request."work_item_id"
  WHERE work_item."status" <> 'V3_RUNTIME';

  SELECT COUNT(*) INTO legacy_work_activity_count
  FROM "work_activities";

  -- The audited WM-V2 Sales data is already terminal at the Sales coordination
  -- level. Stop instead of inventing an incomplete runtime stage if that source
  -- assumption changes before deployment.
  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" <> 'V3_RUNTIME'
      AND "sales_member_account_id" IS NOT NULL
      AND (
        "sales_coordination_status" IS DISTINCT FROM 'COMPLETED'
        OR "sales_completed_at" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-D found legacy Sales Work without proven COMPLETED coordination and sales_completed_at.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    LEFT JOIN "work_stage_definitions" stage_definition
      ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
     AND stage_definition."code" = 'SALES_COORDINATION'
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."sales_member_account_id" IS NOT NULL
    GROUP BY work_item."id"
    HAVING COUNT(stage_definition."id") <> 1
  ) THEN
    RAISE EXCEPTION
      'P8-D requires exactly one SALES_COORDINATION definition for every legacy Sales-linked Work.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    JOIN "work_stage_definitions" stage_definition
      ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
     AND stage_definition."code" = 'SALES_COORDINATION'
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."sales_member_account_id" IS NOT NULL
      AND (
        stage_definition."responsible_org_unit_rule" <> 'SPECIFIC_ORG_UNIT'
        OR stage_definition."responsible_org_unit_id" IS NULL
        OR stage_definition."assignment_mode" <> 'INDIVIDUAL'
        OR stage_definition."approval_mode" <> 'NONE'
      )
  ) THEN
    RAISE EXCEPTION
      'P8-D expected Sales coordination to use SPECIFIC_ORG_UNIT + INDIVIDUAL + NONE approval.';
  END IF;

  -- P8-C must already have instantiated EXECUTION. P8-D itself must start with
  -- no Sales runtime stages so that a partial/manual projection cannot be merged.
  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."sales_member_account_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "work_stages" stage
        WHERE stage."work_item_id" = work_item."id"
          AND stage."code" = 'EXECUTION'
      )
  ) THEN
    RAISE EXCEPTION
      'P8-D requires the completed P8-C EXECUTION stage backfill.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stages" stage
    JOIN "work_items" work_item
      ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."sales_member_account_id" IS NOT NULL
      AND stage."code" = 'SALES_COORDINATION'
  ) THEN
    RAISE EXCEPTION
      'P8-D found a pre-existing SALES_COORDINATION runtime stage on legacy Work.';
  END IF;

  -- The audited dataset has a concrete SALES_MEMBER_ASSIGNED activity for each
  -- Sales-linked Work. That timestamp is the historical assignment evidence.
  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."sales_member_account_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "work_activities" activity
        WHERE activity."work_item_id" = work_item."id"
          AND activity."action" = 'SALES_MEMBER_ASSIGNED'
      )
  ) THEN
    RAISE EXCEPTION
      'P8-D found Sales-linked Work without SALES_MEMBER_ASSIGNED history evidence.';
  END IF;

  -- The current legacy Help rows contain no receiving department/helper. A real
  -- V3 collaboration requires a provable destination OrgUnit, so stop if source
  -- data changes rather than silently forcing those rows into history-only mode.
  IF EXISTS (
    SELECT 1
    FROM "work_help_requests" help_request
    JOIN "work_items" work_item
      ON work_item."id" = help_request."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND (
        help_request."requested_department_id" IS NOT NULL
        OR help_request."requested_helper_account_id" IS NOT NULL
        OR help_request."coordinated_by_account_id" IS NOT NULL
        OR help_request."coordinated_at" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-D found Help destination/coordinator evidence that requires explicit collaboration mapping review.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_help_requests" help_request
    JOIN "work_items" work_item
      ON work_item."id" = help_request."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND help_request."status" NOT IN ('ACCEPTED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION
      'P8-D found an unreviewed legacy Help status.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_help_requests" help_request
    JOIN "work_items" work_item
      ON work_item."id" = help_request."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND (
        help_request."responded_by_account_id" IS NULL
        OR help_request."responded_at" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-D found terminal Help history without responder/timestamp evidence.';
  END IF;

  CREATE TEMP TABLE p8d_sales_projection ON COMMIT DROP AS
  SELECT
    work_item."id" AS work_item_id,
    work_item."office_id" AS office_id,
    work_item."work_type_version_id" AS work_type_version_id,
    work_item."sales_member_account_id" AS sales_member_account_id,
    work_item."sales_documents_sent_at" AS sales_documents_sent_at,
    work_item."sales_completed_at" AS sales_completed_at,
    work_item."sales_completion_note" AS sales_completion_note,

    stage_definition."id" AS stage_definition_id,
    stage_definition."responsible_org_unit_id" AS responsible_org_unit_id,
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

    gen_random_uuid() AS participant_id,
    gen_random_uuid() AS stage_id,

    assigned_activity."actor_account_id" AS assigned_by_account_id,
    assigned_activity."created_at" AS sales_assigned_at,
    documents_activity."actor_account_id" AS documents_actor_account_id,
    completed_activity."actor_account_id" AS completed_actor_account_id
  FROM "work_items" work_item
  JOIN "work_stage_definitions" stage_definition
    ON stage_definition."work_type_version_id" = work_item."work_type_version_id"
   AND stage_definition."code" = 'SALES_COORDINATION'
  LEFT JOIN "work_field_definitions" activation_field
    ON activation_field."id" = stage_definition."activation_field_definition_id"
  JOIN LATERAL (
    SELECT activity."actor_account_id", activity."created_at"
    FROM "work_activities" activity
    WHERE activity."work_item_id" = work_item."id"
      AND activity."action" = 'SALES_MEMBER_ASSIGNED'
    ORDER BY activity."created_at", activity."id"
    LIMIT 1
  ) assigned_activity ON true
  LEFT JOIN LATERAL (
    SELECT activity."actor_account_id", activity."created_at"
    FROM "work_activities" activity
    WHERE activity."work_item_id" = work_item."id"
      AND activity."action" = 'SALES_DOCUMENTS_SENT'
    ORDER BY activity."created_at" DESC, activity."id" DESC
    LIMIT 1
  ) documents_activity ON true
  LEFT JOIN LATERAL (
    SELECT activity."actor_account_id", activity."created_at"
    FROM "work_activities" activity
    WHERE activity."work_item_id" = work_item."id"
      AND activity."action" = 'SALES_WORK_COMPLETED'
    ORDER BY activity."created_at" DESC, activity."id" DESC
    LIMIT 1
  ) completed_activity ON true
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND work_item."sales_member_account_id" IS NOT NULL;

  IF (SELECT COUNT(*) FROM p8d_sales_projection) <> legacy_sales_work_count THEN
    RAISE EXCEPTION
      'P8-D Sales projection count does not match legacy Sales-linked Work count.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p8d_sales_projection projection
    JOIN "org_units" sales_unit
      ON sales_unit."id" = projection.responsible_org_unit_id
    WHERE sales_unit."office_id" <> projection.office_id
  ) THEN
    RAISE EXCEPTION
      'P8-D Sales stage responsible OrgUnit is outside the Work Office.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p8d_sales_projection
    WHERE sales_completed_at < sales_assigned_at
       OR (
         sales_documents_sent_at IS NOT NULL
         AND sales_documents_sent_at < sales_assigned_at
       )
  ) THEN
    RAISE EXCEPTION
      'P8-D found contradictory Sales coordination timestamps.';
  END IF;

  -- Insert the Sales OrgUnit as an active participant first because the runtime
  -- stage integrity trigger requires its responsible OrgUnit to be active at
  -- stage insertion time. It is ended later at the proven Sales completion time.
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
    projection.participant_id,
    projection.work_item_id,
    projection.responsible_org_unit_id,
    'REQUIRED_PARTICIPANT'::"WorkParticipantRole",
    projection.assigned_by_account_id,
    projection.sales_assigned_at,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM p8d_sales_projection projection;

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
    projection.stage_id,
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
    'COMPLETED'::"WorkStageStatus",
    1,
    NULL,
    NULL,
    NULL,
    projection.sales_assigned_at,
    projection.sales_documents_sent_at,
    NULL,
    projection.sales_completed_at,
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM p8d_sales_projection projection;

  SELECT COUNT(*)
  INTO projected_sales_stage_count
  FROM p8d_sales_projection projection
  WHERE EXISTS (
    SELECT 1
    FROM "work_stages" stage
    WHERE stage."id" = projection.stage_id
      AND stage."work_item_id" = projection.work_item_id
      AND stage."stage_definition_id" = projection.stage_definition_id
      AND stage."code" = 'SALES_COORDINATION'
      AND stage."status" = 'COMPLETED'
      AND stage."completed_at" = projection.sales_completed_at
  );

  IF projected_sales_stage_count <> legacy_sales_work_count THEN
    RAISE EXCEPTION
      'P8-D failed to create exactly one completed SALES_COORDINATION stage for every legacy Sales-linked Work.';
  END IF;

  -- Runtime account projection is stricter than the current-membership audit:
  -- membership must have been effective within the proven legacy Sales interval.
  -- If hierarchy backfill starts after Sales completion, the account remains
  -- HISTORY_ONLY instead of creating a temporally impossible assignment.
  CREATE TEMP TABLE p8d_sales_account_assignment_projection ON COMMIT DROP AS
  SELECT
    projection.work_item_id,
    projection.stage_id AS work_stage_id,
    projection.sales_member_account_id AS target_account_id,
    projection.assigned_by_account_id,
    projection.completed_actor_account_id AS ended_by_account_id,
    projection.sales_assigned_at AS legacy_assigned_at,
    GREATEST(projection.sales_assigned_at, membership.membership_starts_at) AS starts_at,
    projection.sales_completed_at AS ends_at
  FROM p8d_sales_projection projection
  JOIN "accounts" account
    ON account."id" = projection.sales_member_account_id
  JOIN LATERAL (
    SELECT org_membership."starts_at" AS membership_starts_at
    FROM "org_memberships" org_membership
    JOIN "org_unit_closure" closure
      ON closure."descendant_org_unit_id" = org_membership."org_unit_id"
    WHERE org_membership."employee_id" = account."employee_id"
      AND org_membership."office_id" = projection.office_id
      AND closure."ancestor_org_unit_id" = projection.responsible_org_unit_id
      AND org_membership."starts_at" <= projection.sales_completed_at
      AND (
        org_membership."ends_at" IS NULL
        OR org_membership."ends_at" > projection.sales_assigned_at
      )
    ORDER BY org_membership."starts_at", org_membership."id"
    LIMIT 1
  ) membership ON true
  WHERE GREATEST(projection.sales_assigned_at, membership.membership_starts_at)
        <= projection.sales_completed_at;

  IF EXISTS (
    SELECT work_item_id
    FROM p8d_sales_account_assignment_projection
    GROUP BY work_item_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'P8-D produced more than one Sales runtime account assignment for one Work.';
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
    'ACCOUNT'::"WorkStageAssignmentTargetType",
    NULL,
    projection.target_account_id,
    'PRIMARY'::"WorkStageAssignmentRole",
    projection.assigned_by_account_id,
    projection.ended_by_account_id,
    'WM-V2 Sales member compatibility projection.',
    'WM-V2 Sales coordination completed.',
    projection.starts_at,
    projection.ends_at,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM p8d_sales_account_assignment_projection projection;

  SELECT COUNT(*)
  INTO projected_sales_runtime_assignment_count
  FROM p8d_sales_account_assignment_projection projection
  WHERE EXISTS (
    SELECT 1
    FROM "work_stage_assignments" assignment_record
    WHERE assignment_record."work_stage_id" = projection.work_stage_id
      AND assignment_record."target_type" = 'ACCOUNT'
      AND assignment_record."target_account_id" = projection.target_account_id
      AND assignment_record."assignment_role" = 'PRIMARY'
      AND assignment_record."assignment_reason" = 'WM-V2 Sales member compatibility projection.'
      AND assignment_record."ends_at" = projection.ends_at
  );

  IF projected_sales_runtime_assignment_count <>
     (SELECT COUNT(*) FROM p8d_sales_account_assignment_projection) THEN
    RAISE EXCEPTION
      'P8-D Sales runtime account-assignment reconciliation failed.';
  END IF;

  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    NULL,
    projection.assigned_by_account_id,
    'PARTICIPANT_ADDED'::"WorkEventType",
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_SALES_PARTICIPANT_BACKFILL',
      'phase', 'P8_D',
      'orgUnitId', projection.responsible_org_unit_id::text,
      'role', 'REQUIRED_PARTICIPANT',
      'legacySalesMemberAccountId', projection.sales_member_account_id::text,
      'compatibilitySnapshot', true
    ),
    projection.sales_assigned_at
  FROM p8d_sales_projection projection;

  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.stage_id,
    projection.assigned_by_account_id,
    'STAGE_READY'::"WorkEventType",
    NULL,
    NULL,
    'PENDING'::"WorkStageStatus",
    'READY'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_SALES_STAGE_BACKFILL',
      'phase', 'P8_D',
      'transition', 'READY',
      'compatibilitySnapshot', true
    ),
    projection.sales_assigned_at
  FROM p8d_sales_projection projection;

  -- Preserve all nine legacy Sales-member relationships in the V3 timeline.
  -- The true legacy assignment timestamp is retained here even when a safe V3
  -- runtime account assignment cannot be created for that historical interval.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.stage_id,
    projection.assigned_by_account_id,
    'STAGE_ASSIGNED'::"WorkEventType",
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_SALES_ASSIGNMENT_HISTORY',
      'phase', 'P8_D',
      'legacySalesMemberAccountId', projection.sales_member_account_id::text,
      'legacySalesAssignedAt', projection.sales_assigned_at,
      'projectionKind', CASE
        WHEN runtime_assignment.work_item_id IS NOT NULL
          THEN 'ACCOUNT_RUNTIME_ASSIGNMENT'
        ELSE 'HISTORY_ONLY'
      END,
      'compatibilitySnapshot', true
    ),
    projection.sales_assigned_at
  FROM p8d_sales_projection projection
  LEFT JOIN p8d_sales_account_assignment_projection runtime_assignment
    ON runtime_assignment.work_item_id = projection.work_item_id;

  SELECT COUNT(*)
  INTO projected_sales_assignment_event_count
  FROM p8d_sales_projection projection
  WHERE EXISTS (
    SELECT 1
    FROM "work_events" event_record
    WHERE event_record."work_item_id" = projection.work_item_id
      AND event_record."work_stage_id" = projection.stage_id
      AND event_record."event_type" = 'STAGE_ASSIGNED'
      AND event_record."details" ->> 'source' = 'WM_V2_SALES_ASSIGNMENT_HISTORY'
      AND event_record."details" ->> 'legacySalesMemberAccountId' = projection.sales_member_account_id::text
  );

  IF projected_sales_assignment_event_count <> legacy_sales_work_count THEN
    RAISE EXCEPTION
      'P8-D Sales assignment-history event reconciliation failed.';
  END IF;

  -- Only the two legacy rows with explicit documents-sent evidence receive a
  -- STAGE_STARTED transition. No start timestamp is fabricated for the others.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.stage_id,
    projection.documents_actor_account_id,
    'STAGE_STARTED'::"WorkEventType",
    NULL,
    NULL,
    'READY'::"WorkStageStatus",
    'IN_PROGRESS'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_SALES_STAGE_BACKFILL',
      'phase', 'P8_D',
      'transition', 'DOCUMENTS_SENT',
      'legacySalesDocumentsSentAt', projection.sales_documents_sent_at,
      'compatibilitySnapshot', true
    ),
    projection.sales_documents_sent_at
  FROM p8d_sales_projection projection
  WHERE projection.sales_documents_sent_at IS NOT NULL;

  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.stage_id,
    projection.completed_actor_account_id,
    'STAGE_COMPLETED'::"WorkEventType",
    NULL,
    NULL,
    CASE
      WHEN projection.sales_documents_sent_at IS NOT NULL
        THEN 'IN_PROGRESS'::"WorkStageStatus"
      ELSE 'READY'::"WorkStageStatus"
    END,
    'COMPLETED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_SALES_STAGE_BACKFILL',
      'phase', 'P8_D',
      'transition', 'COMPLETED',
      'legacySalesCoordinationStatus', 'COMPLETED',
      'legacySalesCompletionNote', projection.sales_completion_note,
      'legacySalesMessageCount', (
        SELECT COUNT(*)
        FROM "work_sales_messages" sales_message
        WHERE sales_message."work_item_id" = projection.work_item_id
      ),
      'legacySalesAttachmentCount', (
        SELECT COUNT(*)
        FROM "work_sales_messages" sales_message
        JOIN "work_sales_attachments" sales_attachment
          ON sales_attachment."message_id" = sales_message."id"
        WHERE sales_message."work_item_id" = projection.work_item_id
      ),
      'legacySalesMessagesPreservedInLegacyTable', true,
      'compatibilitySnapshot', true
    ),
    projection.sales_completed_at
  FROM p8d_sales_projection projection;

  -- End Sales participation at the proven Sales completion time. The stage is
  -- already inserted, so ending this historical participant does not bypass the
  -- stage-insert integrity rule and accurately records that Sales work finished.
  UPDATE "work_org_unit_participants" participant
  SET
    "ended_by_account_id" = projection.completed_actor_account_id,
    "ended_at" = projection.sales_completed_at,
    "end_reason" = 'WM-V2 Sales coordination completed.',
    "updated_at" = CURRENT_TIMESTAMP
  FROM p8d_sales_projection projection
  WHERE participant."id" = projection.participant_id;

  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    NULL,
    projection.completed_actor_account_id,
    'PARTICIPANT_ENDED'::"WorkEventType",
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_SALES_PARTICIPANT_BACKFILL',
      'phase', 'P8_D',
      'orgUnitId', projection.responsible_org_unit_id::text,
      'role', 'REQUIRED_PARTICIPANT',
      'legacySalesMemberAccountId', projection.sales_member_account_id::text,
      'endReason', 'WM-V2 Sales coordination completed.',
      'compatibilitySnapshot', true
    ),
    projection.sales_completed_at
  FROM p8d_sales_projection projection;

  SELECT COUNT(*)
  INTO projected_sales_participant_count
  FROM p8d_sales_projection projection
  WHERE EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" participant
    WHERE participant."id" = projection.participant_id
      AND participant."work_item_id" = projection.work_item_id
      AND participant."org_unit_id" = projection.responsible_org_unit_id
      AND participant."role" = 'REQUIRED_PARTICIPANT'
      AND participant."started_at" = projection.sales_assigned_at
      AND participant."ended_at" = projection.sales_completed_at
      AND participant."end_reason" = 'WM-V2 Sales coordination completed.'
  );

  IF projected_sales_participant_count <> legacy_sales_work_count THEN
    RAISE EXCEPTION
      'P8-D Sales participant-history reconciliation failed.';
  END IF;

  -- Help requests cannot be converted to collaboration rows without a receiving
  -- OrgUnit. Preserve request and response history on the EXECUTION stage instead.
  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    help_request."work_item_id",
    execution_stage."id",
    help_request."requested_by_account_id",
    'WORK_STATUS_CHANGED'::"WorkEventType",
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_HELP_REQUEST_HISTORY',
      'phase', 'P8_D',
      'historyKind', 'HELP_REQUESTED',
      'legacyHelpRequestId', help_request."id"::text,
      'legacyReason', help_request."reason"::text,
      'legacyPreviousStatus', help_request."previous_status"::text,
      'legacyNote', help_request."note",
      'legacyRequestedHelperAccountId', help_request."requested_helper_account_id",
      'legacyRequestedDepartmentId', help_request."requested_department_id",
      'projectionKind', 'HISTORY_ONLY',
      'collaborationCreated', false,
      'projectionReason', 'Legacy Help row has no provable receiving OrgUnit/helper.',
      'compatibilitySnapshot', true
    ),
    help_request."created_at"
  FROM "work_help_requests" help_request
  JOIN "work_items" work_item
    ON work_item."id" = help_request."work_item_id"
  JOIN "work_stages" execution_stage
    ON execution_stage."work_item_id" = help_request."work_item_id"
   AND execution_stage."code" = 'EXECUTION'
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND NOT EXISTS (
      SELECT 1
      FROM "work_events" existing_event
      WHERE existing_event."work_item_id" = help_request."work_item_id"
        AND existing_event."event_type" = 'WORK_STATUS_CHANGED'
        AND existing_event."details" ->> 'source' = 'WM_V2_HELP_REQUEST_HISTORY'
        AND existing_event."details" ->> 'historyKind' = 'HELP_REQUESTED'
        AND existing_event."details" ->> 'legacyHelpRequestId' = help_request."id"::text
    );

  INSERT INTO "work_events" (
    "id", "work_item_id", "work_stage_id", "actor_account_id", "event_type",
    "from_work_status", "to_work_status", "from_stage_status", "to_stage_status",
    "details", "created_at"
  )
  SELECT
    gen_random_uuid(),
    help_request."work_item_id",
    execution_stage."id",
    help_request."responded_by_account_id",
    'WORK_STATUS_CHANGED'::"WorkEventType",
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_HELP_REQUEST_HISTORY',
      'phase', 'P8_D',
      'historyKind', 'HELP_RESPONSE',
      'legacyHelpRequestId', help_request."id"::text,
      'legacyHelpStatus', help_request."status"::text,
      'legacyReason', help_request."reason"::text,
      'legacyResponseNote', help_request."response_note",
      'legacyRespondedAt', help_request."responded_at",
      'projectionKind', 'HISTORY_ONLY',
      'collaborationCreated', false,
      'projectionReason', 'Legacy Help row has no provable receiving OrgUnit/helper.',
      'compatibilitySnapshot', true
    ),
    help_request."responded_at"
  FROM "work_help_requests" help_request
  JOIN "work_items" work_item
    ON work_item."id" = help_request."work_item_id"
  JOIN "work_stages" execution_stage
    ON execution_stage."work_item_id" = help_request."work_item_id"
   AND execution_stage."code" = 'EXECUTION'
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND help_request."responded_at" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "work_events" existing_event
      WHERE existing_event."work_item_id" = help_request."work_item_id"
        AND existing_event."event_type" = 'WORK_STATUS_CHANGED'
        AND existing_event."details" ->> 'source' = 'WM_V2_HELP_REQUEST_HISTORY'
        AND existing_event."details" ->> 'historyKind' = 'HELP_RESPONSE'
        AND existing_event."details" ->> 'legacyHelpRequestId' = help_request."id"::text
    );

  SELECT COUNT(*)
  INTO projected_help_request_event_count
  FROM "work_help_requests" help_request
  JOIN "work_items" work_item
    ON work_item."id" = help_request."work_item_id"
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND EXISTS (
      SELECT 1
      FROM "work_events" event_record
      WHERE event_record."work_item_id" = help_request."work_item_id"
        AND event_record."event_type" = 'WORK_STATUS_CHANGED'
        AND event_record."details" ->> 'source' = 'WM_V2_HELP_REQUEST_HISTORY'
        AND event_record."details" ->> 'historyKind' = 'HELP_REQUESTED'
        AND event_record."details" ->> 'legacyHelpRequestId' = help_request."id"::text
    );

  IF projected_help_request_event_count <> legacy_help_request_count THEN
    RAISE EXCEPTION
      'P8-D Help request-history reconciliation failed.';
  END IF;

  SELECT COUNT(*)
  INTO projected_help_response_event_count
  FROM "work_help_requests" help_request
  JOIN "work_items" work_item
    ON work_item."id" = help_request."work_item_id"
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND help_request."responded_at" IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "work_events" event_record
      WHERE event_record."work_item_id" = help_request."work_item_id"
        AND event_record."event_type" = 'WORK_STATUS_CHANGED'
        AND event_record."details" ->> 'source' = 'WM_V2_HELP_REQUEST_HISTORY'
        AND event_record."details" ->> 'historyKind' = 'HELP_RESPONSE'
        AND event_record."details" ->> 'legacyHelpRequestId' = help_request."id"::text
    );

  IF projected_help_response_event_count <>
     (
       SELECT COUNT(*)
       FROM "work_help_requests" help_request
       JOIN "work_items" work_item
         ON work_item."id" = help_request."work_item_id"
       WHERE work_item."status" <> 'V3_RUNTIME'
         AND help_request."responded_at" IS NOT NULL
     ) THEN
    RAISE EXCEPTION
      'P8-D Help response-history reconciliation failed.';
  END IF;

  -- P8-D intentionally creates no WorkCollaborationRequest for these three Help
  -- rows because the audited source does not identify a receiving OrgUnit.
  IF EXISTS (
    SELECT 1
    FROM "work_events" event_record
    WHERE event_record."details" ->> 'source' = 'WM_V2_HELP_REQUEST_HISTORY'
      AND event_record."details" ->> 'projectionKind' <> 'HISTORY_ONLY'
  ) THEN
    RAISE EXCEPTION
      'P8-D unexpectedly projected a legacy Help row as a non-history-only collaboration.';
  END IF;

  -- Legacy evidence must remain byte-for-byte addressable by its original rows.
  IF (SELECT COUNT(*) FROM "work_sales_messages") <> legacy_sales_message_count THEN
    RAISE EXCEPTION
      'P8-D unexpectedly changed the legacy Sales message count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_sales_attachments") <> legacy_sales_attachment_count THEN
    RAISE EXCEPTION
      'P8-D unexpectedly changed the legacy Sales attachment count.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_help_requests" help_request
    JOIN "work_items" work_item
      ON work_item."id" = help_request."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) <> legacy_help_request_count THEN
    RAISE EXCEPTION
      'P8-D unexpectedly changed the legacy Help request count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_activities") <> legacy_work_activity_count THEN
    RAISE EXCEPTION
      'P8-D unexpectedly changed the legacy WorkActivity count.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_items"
    WHERE "status" <> 'V3_RUNTIME'
      AND "sales_member_account_id" IS NOT NULL
  ) <> legacy_sales_work_count THEN
    RAISE EXCEPTION
      'P8-D unexpectedly changed the legacy Sales-linked Work count.';
  END IF;
END
$$;
