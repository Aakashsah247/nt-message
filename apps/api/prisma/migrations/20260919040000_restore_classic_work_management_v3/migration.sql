-- Restore the proven classic Work lifecycle while retaining the Phase-13/V3
-- Office -> OrgUnit -> OperationalTeam organization model.
--
-- IMPORTANT: Phase 13 physically removed the old WM-V2 WorkItem columns
-- (type/division_id/department_id/assigned_team_id/responsible_manager_account_id).
-- This migration therefore ports lifecycle semantics only; it never recreates
-- or references the retired hierarchy columns. WorkStage/WorkEvent data remains
-- intact as historical audit evidence.

-- 1. Remove V3 runtime-only constraints before converting native V3 rows.
ALTER TABLE "work_items"
  DROP CONSTRAINT IF EXISTS "work_items_v3_context_complete_check",
  DROP CONSTRAINT IF EXISTS "work_items_org_context_complete_check",
  DROP CONSTRAINT IF EXISTS "work_items_legacy_required_fields_check",
  DROP CONSTRAINT IF EXISTS "work_items_v3_legacy_fields_clear_check",
  DROP CONSTRAINT IF EXISTS "work_items_runtime_marker_check",
  DROP CONSTRAINT IF EXISTS "work_items_native_v3_legacy_fields_clear_check",
  DROP CONSTRAINT IF EXISTS "work_items_native_v3_runtime_marker_check";

-- Phase 13 reconciled every Work row to Office/Work Type/Primary Owner. Keep
-- that identity invariant, but remove any coupling to runtime_status.
ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_org_context_complete_check"
  CHECK (
    "office_id" IS NOT NULL
    AND "work_type_version_id" IS NOT NULL
    AND "primary_owner_org_unit_id" IS NOT NULL
  );

-- 2. Add the canonical Main Team projection used by the restored lifecycle.
ALTER TABLE "work_items"
  ADD COLUMN IF NOT EXISTS "assigned_operational_team_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'work_items_assigned_operational_team_id_fkey'
      AND conrelid = 'work_items'::regclass
  ) THEN
    ALTER TABLE "work_items"
      ADD CONSTRAINT "work_items_assigned_operational_team_id_fkey"
      FOREIGN KEY ("assigned_operational_team_id")
      REFERENCES "operational_teams"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "work_items_operational_team_status_due_idx"
  ON "work_items"("assigned_operational_team_id", "status", "due_at");

-- Recover Main Team from the one canonical EXECUTION + PRIMARY team assignment.
-- This is also required for compatibility-bound WM-V2 rows because Phase 13
-- removed assigned_team_id after projecting execution into WorkStageAssignment.
WITH ranked_team AS (
  SELECT
    stage."work_item_id",
    assignment."target_operational_team_id",
    ROW_NUMBER() OVER (
      PARTITION BY stage."work_item_id"
      ORDER BY
        CASE WHEN assignment."ends_at" IS NULL THEN 0 ELSE 1 END,
        assignment."starts_at" DESC,
        assignment."created_at" DESC,
        assignment."id" DESC
    ) AS rn
  FROM "work_stages" stage
  JOIN "work_stage_assignments" assignment
    ON assignment."work_stage_id" = stage."id"
  WHERE stage."code" = 'EXECUTION'
    AND assignment."assignment_role" = 'PRIMARY'
    AND assignment."target_operational_team_id" IS NOT NULL
)
UPDATE "work_items" item
SET "assigned_operational_team_id" = team."target_operational_team_id"
FROM ranked_team team
WHERE item."id" = team."work_item_id"
  AND team.rn = 1
  AND item."assigned_operational_team_id" IS DISTINCT FROM team."target_operational_team_id";

-- 3. Project native V3 intake fields back to the classic WorkItem columns.
-- Existing WM-V2/classic values are preserved with COALESCE; only true native
-- V3 rows (status = V3_RUNTIME) are eligible for projection.
UPDATE "work_items" item
SET "customer_name" = COALESCE(item."customer_name", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'CUSTOMER_NAME';

UPDATE "work_items" item
SET "customer_contact_type" = COALESCE(
  item."customer_contact_type",
  CASE
    WHEN value_record."value" #>> '{}' IN ('MOBILE', 'TELEPHONE')
      THEN (value_record."value" #>> '{}')::"WorkContactType"
    ELSE NULL
  END
)
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'CUSTOMER_CONTACT_TYPE';

UPDATE "work_items" item
SET "customer_contact_number" = COALESCE(item."customer_contact_number", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'CUSTOMER_CONTACT_NUMBER';

UPDATE "work_items" item
SET "location_text" = COALESCE(item."location_text", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'LOCATION';

UPDATE "work_items" item
SET "registered_at" = COALESCE(item."registered_at", NULLIF(value_record."value" #>> '{}', '')::timestamptz)
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'REGISTERED_AT';

UPDATE "work_items" item
SET "olt" = COALESCE(item."olt", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'OLT';

UPDATE "work_items" item
SET "fdc_name" = COALESCE(item."fdc_name", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'FDC_NAME';

UPDATE "work_items" item
SET "fap_name" = COALESCE(item."fap_name", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'FAP_NAME';

UPDATE "work_items" item
SET "service_number" = COALESCE(item."service_number", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'SERVICE_NUMBER';

UPDATE "work_items" item
SET "request_number" = COALESCE(item."request_number", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'TOKEN_NUMBER';

UPDATE "work_items" item
SET "cpc_serial" = COALESCE(item."cpc_serial", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'CPC_SERIAL';

UPDATE "work_items" item
SET "other_service_text" = COALESCE(item."other_service_text", NULLIF(value_record."value" #>> '{}', ''))
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'OTHER_SERVICE_TEXT';

UPDATE "work_items" item
SET "service_types" = CASE
  WHEN COALESCE(array_length(item."service_types", 1), 0) > 0 THEN item."service_types"
  ELSE ARRAY(
    SELECT service_value.value::"WorkServiceType"
    FROM jsonb_array_elements_text(value_record."value") AS service_value(value)
    WHERE service_value.value IN ('DATA', 'VOICE', 'IPTV', 'SIP', 'OTHER')
  )
END
FROM "work_field_values" value_record
JOIN "work_field_definitions" definition
  ON definition."id" = value_record."field_definition_id"
WHERE item."id" = value_record."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND value_record."work_stage_id" IS NULL
  AND definition."code" = 'SERVICE_TYPES'
  AND jsonb_typeof(value_record."value") = 'array';

-- 4. Recover the classic Sales participant from the SALES_COORDINATION stage.
WITH ranked_sales AS (
  SELECT
    stage."work_item_id",
    assignment."target_account_id",
    ROW_NUMBER() OVER (
      PARTITION BY stage."work_item_id"
      ORDER BY
        CASE WHEN assignment."ends_at" IS NULL THEN 0 ELSE 1 END,
        assignment."starts_at" DESC,
        assignment."created_at" DESC,
        assignment."id" DESC
    ) AS rn
  FROM "work_stages" stage
  JOIN "work_stage_assignments" assignment
    ON assignment."work_stage_id" = stage."id"
  JOIN "work_items" item
    ON item."id" = stage."work_item_id"
  WHERE item."status" = 'V3_RUNTIME'::"WorkItemStatus"
    AND stage."code" = 'SALES_COORDINATION'
    AND assignment."assignment_role" = 'PRIMARY'
    AND assignment."target_account_id" IS NOT NULL
)
UPDATE "work_items" item
SET "sales_member_account_id" = COALESCE(item."sales_member_account_id", sales."target_account_id")
FROM ranked_sales sales
WHERE item."id" = sales."work_item_id"
  AND sales.rn = 1;

UPDATE "work_items" item
SET
  "sales_coordination_status" = CASE
    WHEN stage."status" = 'COMPLETED'::"WorkStageStatus"
      THEN 'COMPLETED'::"WorkSalesCoordinationStatus"
    WHEN stage."status" = 'PENDING'::"WorkStageStatus"
      THEN 'WAITING_FOR_DOCUMENTS'::"WorkSalesCoordinationStatus"
    ELSE 'READY_FOR_SALES'::"WorkSalesCoordinationStatus"
  END,
  "sales_documents_sent_at" = COALESCE(item."sales_documents_sent_at", stage."ready_at", stage."started_at"),
  "sales_completed_at" = CASE
    WHEN stage."status" = 'COMPLETED'::"WorkStageStatus"
      THEN COALESCE(item."sales_completed_at", stage."completed_at", stage."updated_at")
    ELSE item."sales_completed_at"
  END
FROM "work_stages" stage
WHERE item."id" = stage."work_item_id"
  AND item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND stage."code" = 'SALES_COORDINATION';

-- 5. Recover direct classic employee responsibility only for true native V3
-- rows. Existing WM-V2 WorkAssignment history is never deleted or rewritten.
INSERT INTO "work_assignments" (
  "id",
  "work_item_id",
  "assignee_account_id",
  "assignment_role",
  "assigned_by_account_id",
  "acknowledged_at",
  "started_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  stage."work_item_id",
  assignment."target_account_id",
  CASE
    WHEN assignment."assignment_role" = 'SUPPORTING'::"WorkStageAssignmentRole"
      THEN 'SUPPORTING'::"WorkAssignmentRole"
    ELSE 'PRIMARY'::"WorkAssignmentRole"
  END,
  COALESCE(assignment."assigned_by_account_id", item."created_by_account_id"),
  CASE
    WHEN stage."status" IN (
      'IN_PROGRESS'::"WorkStageStatus",
      'BLOCKED'::"WorkStageStatus",
      'SUBMITTED'::"WorkStageStatus",
      'RETURNED'::"WorkStageStatus",
      'COMPLETED'::"WorkStageStatus"
    ) THEN COALESCE(stage."started_at", assignment."starts_at")
    ELSE NULL
  END,
  CASE
    WHEN stage."status" IN (
      'IN_PROGRESS'::"WorkStageStatus",
      'BLOCKED'::"WorkStageStatus",
      'SUBMITTED'::"WorkStageStatus",
      'RETURNED'::"WorkStageStatus",
      'COMPLETED'::"WorkStageStatus"
    ) THEN COALESCE(stage."started_at", assignment."starts_at")
    ELSE NULL
  END,
  assignment."created_at",
  CURRENT_TIMESTAMP
FROM "work_stage_assignments" assignment
JOIN "work_stages" stage
  ON stage."id" = assignment."work_stage_id"
JOIN "work_items" item
  ON item."id" = stage."work_item_id"
WHERE item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND stage."code" = 'EXECUTION'
  AND assignment."target_account_id" IS NOT NULL
  AND assignment."ends_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "work_assignments" existing
    WHERE existing."work_item_id" = stage."work_item_id"
      AND existing."assignee_account_id" = assignment."target_account_id"
      AND existing."ended_at" IS NULL
  );

-- 6. Bridge native V3 EXECUTION submissions into the classic completion-report
-- history. P8-E used the same UUID in the opposite direction for WM-V2 rows,
-- so ON CONFLICT(id) naturally preserves already-classic reports.
INSERT INTO "work_completion_reports" (
  "id",
  "work_item_id",
  "submitted_by_account_id",
  "result",
  "summary",
  "customer_id",
  "rx_level_dbm",
  "more_work_required",
  "review_status",
  "manager_note",
  "reviewed_by_account_id",
  "reviewed_at",
  "created_at",
  "updated_at"
)
SELECT
  submission."id",
  stage."work_item_id",
  submission."submitted_by_account_id",
  (result_value.value #>> '{}')::"WorkCompletionResult",
  summary_value.value #>> '{}',
  NULLIF(customer_id_value.value #>> '{}', ''),
  NULLIF(rx_value.value #>> '{}', '')::double precision,
  COALESCE(NULLIF(more_work_value.value #>> '{}', '')::boolean, false),
  CASE
    WHEN approval."decision" = 'APPROVED'::"WorkStageApprovalDecision"
      THEN 'ACCEPTED'::"WorkCompletionReviewStatus"
    WHEN approval."decision" = 'RETURNED'::"WorkStageApprovalDecision"
      THEN 'INFORMATION_REQUESTED'::"WorkCompletionReviewStatus"
    ELSE 'PENDING_REVIEW'::"WorkCompletionReviewStatus"
  END,
  approval."reason",
  approval."decided_by_account_id",
  approval."created_at",
  submission."created_at",
  COALESCE(approval."created_at", submission."created_at")
FROM "work_stage_submissions" submission
JOIN "work_stages" stage
  ON stage."id" = submission."work_stage_id"
JOIN "work_items" item
  ON item."id" = stage."work_item_id"
LEFT JOIN "work_stage_approvals" approval
  ON approval."submission_id" = submission."id"
LEFT JOIN LATERAL (
  SELECT field_record -> 'value' AS value
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(submission."values_snapshot" -> 'fields') = 'array'
        THEN submission."values_snapshot" -> 'fields'
      ELSE '[]'::jsonb
    END
  ) field_record
  WHERE field_record ->> 'code' = 'COMPLETION_RESULT'
  LIMIT 1
) result_value ON true
LEFT JOIN LATERAL (
  SELECT field_record -> 'value' AS value
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(submission."values_snapshot" -> 'fields') = 'array'
        THEN submission."values_snapshot" -> 'fields'
      ELSE '[]'::jsonb
    END
  ) field_record
  WHERE field_record ->> 'code' = 'COMPLETION_SUMMARY'
  LIMIT 1
) summary_value ON true
LEFT JOIN LATERAL (
  SELECT field_record -> 'value' AS value
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(submission."values_snapshot" -> 'fields') = 'array'
        THEN submission."values_snapshot" -> 'fields'
      ELSE '[]'::jsonb
    END
  ) field_record
  WHERE field_record ->> 'code' = 'MORE_WORK_REQUIRED'
  LIMIT 1
) more_work_value ON true
LEFT JOIN LATERAL (
  SELECT field_record -> 'value' AS value
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(submission."values_snapshot" -> 'fields') = 'array'
        THEN submission."values_snapshot" -> 'fields'
      ELSE '[]'::jsonb
    END
  ) field_record
  WHERE field_record ->> 'code' = 'CUSTOMER_ID'
  LIMIT 1
) customer_id_value ON true
LEFT JOIN LATERAL (
  SELECT field_record -> 'value' AS value
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(submission."values_snapshot" -> 'fields') = 'array'
        THEN submission."values_snapshot" -> 'fields'
      ELSE '[]'::jsonb
    END
  ) field_record
  WHERE field_record ->> 'code' = 'RX_LEVEL_DBM'
  LIMIT 1
) rx_value ON true
WHERE item."status" = 'V3_RUNTIME'::"WorkItemStatus"
  AND stage."code" = 'EXECUTION'
  AND result_value.value #>> '{}' IN ('FULLY_RESOLVED', 'TEMPORARY_SOLUTION', 'UNABLE_TO_RESOLVE')
  AND NULLIF(summary_value.value #>> '{}', '') IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- 7. Convert ONLY native V3 Work rows. Compatibility-bound WM-V2 rows already
-- carry the proven classic status and must never be downgraded from values such
-- as ACKNOWLEDGED, HELP_REQUESTED or COMPLETED_PENDING_REVIEW.
WITH execution_state AS (
  SELECT DISTINCT ON (stage."work_item_id")
    stage."work_item_id",
    stage."status" AS execution_status
  FROM "work_stages" stage
  WHERE stage."code" = 'EXECUTION'
  ORDER BY stage."work_item_id", stage."created_at" DESC, stage."id" DESC
),
status_source AS (
  SELECT
    item."id",
    item."runtime_status",
    execution_state.execution_status
  FROM "work_items" item
  LEFT JOIN execution_state
    ON execution_state."work_item_id" = item."id"
  WHERE item."status" = 'V3_RUNTIME'::"WorkItemStatus"
)
UPDATE "work_items" item
SET
  "status" = CASE
    WHEN source."runtime_status" = 'COMPLETED'::"WorkRuntimeStatus"
      THEN 'CLOSED'::"WorkItemStatus"
    WHEN source."runtime_status" = 'CANCELLED'::"WorkRuntimeStatus"
      THEN 'CANCELLED'::"WorkItemStatus"
    WHEN source.execution_status IN ('SUBMITTED'::"WorkStageStatus", 'COMPLETED'::"WorkStageStatus")
      THEN 'COMPLETED_PENDING_REVIEW'::"WorkItemStatus"
    WHEN source.execution_status = 'RETURNED'::"WorkStageStatus"
      THEN 'REOPENED'::"WorkItemStatus"
    WHEN source.execution_status = 'BLOCKED'::"WorkStageStatus"
      OR source."runtime_status" = 'BLOCKED'::"WorkRuntimeStatus"
      THEN 'BLOCKED'::"WorkItemStatus"
    WHEN source.execution_status = 'IN_PROGRESS'::"WorkStageStatus"
      OR source."runtime_status" = 'IN_PROGRESS'::"WorkRuntimeStatus"
      THEN 'IN_PROGRESS'::"WorkItemStatus"
    ELSE 'ASSIGNED'::"WorkItemStatus"
  END,
  "completed_at" = CASE
    WHEN source."runtime_status" = 'COMPLETED'::"WorkRuntimeStatus"
      THEN COALESCE(item."completed_at", item."updated_at")
    WHEN source.execution_status IN ('SUBMITTED'::"WorkStageStatus", 'COMPLETED'::"WorkStageStatus")
      THEN COALESCE(item."completed_at", item."updated_at")
    ELSE item."completed_at"
  END,
  "closed_at" = CASE
    WHEN source."runtime_status" = 'COMPLETED'::"WorkRuntimeStatus"
      THEN COALESCE(item."closed_at", item."updated_at")
    ELSE item."closed_at"
  END,
  "cancelled_at" = CASE
    WHEN source."runtime_status" = 'CANCELLED'::"WorkRuntimeStatus"
      THEN COALESCE(item."cancelled_at", item."updated_at")
    ELSE item."cancelled_at"
  END
FROM status_source source
WHERE item."id" = source."id";

-- Runtime status is now historical-only. Clear it from every canonical WorkItem
-- before the following migration physically removes the column.
UPDATE "work_items"
SET "runtime_status" = NULL
WHERE "runtime_status" IS NOT NULL;

-- 8. Existing Work created before Responsible Reviewer selection was introduced
-- may still be active with a null reviewer. Assign the nearest current formal
-- hierarchy Head, falling back to the Office Head, while keeping reviewer and
-- performer responsibilities separate.
WITH reviewer_candidates AS (
  SELECT
    item."id" AS work_item_id,
    account."id" AS reviewer_account_id,
    ROW_NUMBER() OVER (
      PARTITION BY item."id"
      ORDER BY
        CASE
          WHEN leadership."leadership_type" = 'ORG_UNIT_HEAD'::"OrgLeadershipType" THEN 0
          ELSE 1
        END,
        COALESCE(closure."depth", 2147483647),
        leadership."is_acting" ASC,
        leadership."effective_from" DESC,
        leadership."id" DESC
    ) AS rn
  FROM "work_items" item
  JOIN "org_leadership_assignments" leadership
    ON leadership."office_id" = item."office_id"
  JOIN "accounts" account
    ON account."employee_id" = leadership."employee_id"
   AND account."is_enabled" = true
  LEFT JOIN "org_unit_closure" closure
    ON closure."ancestor_org_unit_id" = leadership."org_unit_id"
   AND closure."descendant_org_unit_id" = item."primary_owner_org_unit_id"
  WHERE item."status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
    AND leadership."leadership_type" IN (
      'OFFICE_HEAD'::"OrgLeadershipType",
      'ORG_UNIT_HEAD'::"OrgLeadershipType"
    )
    AND leadership."effective_from" <= CURRENT_TIMESTAMP
    AND (leadership."effective_until" IS NULL OR leadership."effective_until" > CURRENT_TIMESTAMP)
    AND (
      leadership."leadership_type" = 'OFFICE_HEAD'::"OrgLeadershipType"
      OR closure."ancestor_org_unit_id" IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "work_assignments" assignment
      WHERE assignment."work_item_id" = item."id"
        AND assignment."assignee_account_id" = account."id"
        AND assignment."ended_at" IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "operational_team_members" member
      WHERE member."team_id" = item."assigned_operational_team_id"
        AND member."employee_id" = leadership."employee_id"
        AND member."starts_at" <= CURRENT_TIMESTAMP
        AND (member."ends_at" IS NULL OR member."ends_at" > CURRENT_TIMESTAMP)
    )
),
needs_reviewer AS (
  SELECT item."id"
  FROM "work_items" item
  LEFT JOIN "accounts" reviewer
    ON reviewer."id" = item."responsible_reviewer_account_id"
  WHERE item."status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
    AND (
      item."responsible_reviewer_account_id" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "work_assignments" assignment
        WHERE assignment."work_item_id" = item."id"
          AND assignment."assignee_account_id" = item."responsible_reviewer_account_id"
          AND assignment."ended_at" IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM "operational_team_members" member
        WHERE member."team_id" = item."assigned_operational_team_id"
          AND member."employee_id" = reviewer."employee_id"
          AND member."starts_at" <= CURRENT_TIMESTAMP
          AND (member."ends_at" IS NULL OR member."ends_at" > CURRENT_TIMESTAMP)
      )
    )
)
UPDATE "work_items" item
SET "responsible_reviewer_account_id" = candidate."reviewer_account_id"
FROM reviewer_candidates candidate
JOIN needs_reviewer needed
  ON needed."id" = candidate."work_item_id"
WHERE item."id" = candidate."work_item_id"
  AND candidate.rn = 1;

-- 9. Fail loudly if the canonical projection is incomplete. These checks use
-- only columns/models that exist after Phase 13.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" = 'V3_RUNTIME'::"WorkItemStatus"
       OR "runtime_status" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover left unresolved V3 runtime WorkItem rows.';
  END IF;

  IF EXISTS (
    WITH expected_team AS (
      SELECT DISTINCT ON (stage."work_item_id")
        stage."work_item_id",
        assignment."target_operational_team_id"
      FROM "work_stages" stage
      JOIN "work_stage_assignments" assignment
        ON assignment."work_stage_id" = stage."id"
      WHERE stage."code" = 'EXECUTION'
        AND assignment."assignment_role" = 'PRIMARY'
        AND assignment."target_operational_team_id" IS NOT NULL
      ORDER BY
        stage."work_item_id",
        CASE WHEN assignment."ends_at" IS NULL THEN 0 ELSE 1 END,
        assignment."starts_at" DESC,
        assignment."created_at" DESC,
        assignment."id" DESC
    )
    SELECT 1
    FROM expected_team expected
    JOIN "work_items" item
      ON item."id" = expected."work_item_id"
    WHERE item."assigned_operational_team_id" IS DISTINCT FROM expected."target_operational_team_id"
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover canonical Main Team reconciliation failed.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" = 'COMPLETED_PENDING_REVIEW'::"WorkItemStatus"
      AND NOT EXISTS (
        SELECT 1
        FROM "work_completion_reports" report
        WHERE report."work_item_id" = "work_items"."id"
      )
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover found pending-review Work without a completion report.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
      AND "responsible_reviewer_account_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover found active Work without a Responsible Reviewer.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" item
    WHERE item."status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
      AND EXISTS (
        SELECT 1
        FROM "work_assignments" assignment
        WHERE assignment."work_item_id" = item."id"
          AND assignment."assignee_account_id" = item."responsible_reviewer_account_id"
          AND assignment."ended_at" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover found an active Responsible Reviewer who is also an active Work assignee.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" item
    JOIN "accounts" reviewer
      ON reviewer."id" = item."responsible_reviewer_account_id"
    WHERE item."status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
      AND item."assigned_operational_team_id" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "operational_team_members" member
        WHERE member."team_id" = item."assigned_operational_team_id"
          AND member."employee_id" = reviewer."employee_id"
          AND member."starts_at" <= CURRENT_TIMESTAMP
          AND (member."ends_at" IS NULL OR member."ends_at" > CURRENT_TIMESTAMP)
      )
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover found a Responsible Reviewer inside the performing Main Team.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" item
    JOIN "work_type_versions" version
      ON version."id" = item."work_type_version_id"
    WHERE item."status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
      AND NOT EXISTS (
        SELECT 1
        FROM "work_stage_definitions" execution_definition
        WHERE execution_definition."work_type_version_id" = version."id"
          AND execution_definition."code" = 'EXECUTION'
          AND execution_definition."assignment_mode" = 'TEAM_OR_USER'::"WorkStageAssignmentMode"
      )
      AND item."assigned_operational_team_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover found active operational Work without a Main Team.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" item
    JOIN "work_type_versions" version
      ON version."id" = item."work_type_version_id"
    WHERE item."status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
      AND NOT EXISTS (
        SELECT 1
        FROM "work_stage_definitions" execution_definition
        WHERE execution_definition."work_type_version_id" = version."id"
          AND execution_definition."code" = 'EXECUTION'
          AND execution_definition."assignment_mode" = 'TEAM_OR_USER'::"WorkStageAssignmentMode"
      )
      AND item."registered_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover found active operational Work without Registered Date & Time.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" item
    JOIN "work_type_versions" version
      ON version."id" = item."work_type_version_id"
    WHERE item."status" NOT IN ('CLOSED'::"WorkItemStatus", 'CANCELLED'::"WorkItemStatus")
      AND EXISTS (
        SELECT 1
        FROM "work_stage_definitions" sales_definition
        WHERE sales_definition."work_type_version_id" = version."id"
          AND sales_definition."code" = 'SALES_COORDINATION'
      )
      AND item."sales_member_account_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Classic Work cutover found active Team + Sales Work without a Sales Member.';
  END IF;
END $$;
