-- Phase 8 / P8-E: preserve legacy Technical Work field values and immutable
-- completion / manager-review evidence inside Work Runtime V3 compatibility.
--
-- This migration is intentionally additive:
--   * legacy WorkItem technical columns remain readable;
--   * work_completion_reports and work_activities remain untouched;
--   * only values supported by the published V3 Work Type Version are copied;
--   * no missing legacy required value is fabricated;
--   * New Installation Token Number comes from request_number, never ticket_number;
--   * New Installation legacy service_number evidence is retained only in legacy
--     storage because the V3 New Installation configuration has no SERVICE_NUMBER;
--   * surviving completion reports become immutable V3 stage submissions and
--     approvals/returns without mutating the current synthetic EXECUTION stage;
--   * the one historically submitted report whose payload no longer survives is
--     represented by history-only stage events instead of a fabricated submission.
--
-- Reports V2 remains legacy-only until the dedicated Reports V3 phase.

DO $$
DECLARE
  legacy_work_count INTEGER;
  legacy_completion_report_count INTEGER;
  legacy_work_activity_count INTEGER;
  completion_submit_activity_count INTEGER;
  information_requested_activity_count INTEGER;

  projected_intake_value_count INTEGER;
  projected_completion_value_count INTEGER;
  projected_reference_count INTEGER;
  projected_submission_count INTEGER;
  projected_approval_count INTEGER;
  projected_report_submit_event_count INTEGER;
  projected_report_review_event_count INTEGER;
  projected_orphan_submit_event_count INTEGER;
  projected_orphan_return_event_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO legacy_work_count
  FROM "work_items"
  WHERE "status" <> 'V3_RUNTIME';

  SELECT COUNT(*)
  INTO legacy_completion_report_count
  FROM "work_completion_reports";

  SELECT COUNT(*)
  INTO legacy_work_activity_count
  FROM "work_activities";

  SELECT COUNT(*)
  INTO completion_submit_activity_count
  FROM "work_activities"
  WHERE "action" = 'COMPLETION_SUBMITTED';

  SELECT COUNT(*)
  INTO information_requested_activity_count
  FROM "work_activities"
  WHERE "action" = 'INFORMATION_REQUESTED';

  -- P8-E was designed against the fully reconciled P8-C/P8-D database. Abort
  -- rather than silently projecting a changed source dataset.
  IF legacy_work_count <> 45 THEN
    RAISE EXCEPTION
      'P8-E expected 45 legacy Work rows after P8-D, found %.',
      legacy_work_count;
  END IF;

  IF legacy_completion_report_count <> 22 THEN
    RAISE EXCEPTION
      'P8-E expected 22 surviving legacy completion reports, found %.',
      legacy_completion_report_count;
  END IF;

  IF legacy_work_activity_count <> 268 THEN
    RAISE EXCEPTION
      'P8-E expected 268 preserved legacy WorkActivity rows, found %.',
      legacy_work_activity_count;
  END IF;

  IF completion_submit_activity_count <> 23 THEN
    RAISE EXCEPTION
      'P8-E expected 23 legacy COMPLETION_SUBMITTED activities, found %.',
      completion_submit_activity_count;
  END IF;

  IF information_requested_activity_count <> 2 THEN
    RAISE EXCEPTION
      'P8-E expected 2 legacy INFORMATION_REQUESTED activities, found %.',
      information_requested_activity_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND (
        work_item."office_id" IS NULL
        OR work_item."work_type_version_id" IS NULL
        OR work_item."primary_owner_org_unit_id" IS NULL
        OR work_item."runtime_status" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-E requires every legacy Work row to have complete V3 compatibility identity.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    LEFT JOIN "work_stages" stage
      ON stage."work_item_id" = work_item."id"
     AND stage."code" = 'EXECUTION'
    WHERE work_item."status" <> 'V3_RUNTIME'
    GROUP BY work_item."id"
    HAVING COUNT(stage."id") <> 1
  ) THEN
    RAISE EXCEPTION
      'P8-E requires exactly one P8-C EXECUTION runtime stage for every legacy Work.';
  END IF;

  -- This migration must start before any manual/partial P8-E projection.
  IF EXISTS (
    SELECT 1
    FROM "work_field_values" field_value
    JOIN "work_items" work_item
      ON work_item."id" = field_value."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) THEN
    RAISE EXCEPTION
      'P8-E found pre-existing V3 field values on legacy Work. Reconcile them before migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_references" reference_record
    JOIN "work_items" work_item
      ON work_item."id" = reference_record."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) THEN
    RAISE EXCEPTION
      'P8-E found pre-existing V3 references on legacy Work. Reconcile them before migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_submissions" submission
    JOIN "work_stages" stage
      ON stage."id" = submission."work_stage_id"
    JOIN "work_items" work_item
      ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) THEN
    RAISE EXCEPTION
      'P8-E found pre-existing V3 submissions on legacy Work. Reconcile them before migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_approvals" approval
    JOIN "work_stages" stage
      ON stage."id" = approval."work_stage_id"
    JOIN "work_items" work_item
      ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) THEN
    RAISE EXCEPTION
      'P8-E found pre-existing V3 approvals on legacy Work. Reconcile them before migration.';
  END IF;

  -- Locked technical rule: New Installation has TOKEN_NUMBER + CPC_SERIAL and
  -- no SERVICE_NUMBER field in its published compatibility version.
  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    JOIN "work_field_definitions" field_definition
      ON field_definition."work_type_version_id" = work_item."work_type_version_id"
     AND field_definition."code" = 'SERVICE_NUMBER'
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."type" = 'NEW_CONNECTION'
  ) THEN
    RAISE EXCEPTION
      'P8-E found a V3 SERVICE_NUMBER field on New Installation, which violates the locked migration rule.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    LEFT JOIN "work_field_definitions" token_field
      ON token_field."work_type_version_id" = work_item."work_type_version_id"
     AND token_field."code" = 'TOKEN_NUMBER'
     AND token_field."stage_definition_id" IS NULL
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."type" IN ('NEW_CONNECTION', 'UPDATE_SERVICES')
      AND (
        work_item."request_number" IS NULL
        OR btrim(work_item."request_number") = ''
        OR token_field."id" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P8-E requires every legacy New Installation / Update Services record to have request_number and a V3 TOKEN_NUMBER definition.';
  END IF;

  -- Every surviving completion report must target exactly one EXECUTION stage,
  -- be reviewed, and use only the two known legacy review outcomes.
  IF EXISTS (
    SELECT 1
    FROM "work_completion_reports" report
    JOIN "work_items" work_item
      ON work_item."id" = report."work_item_id"
    LEFT JOIN "work_stages" stage
      ON stage."work_item_id" = report."work_item_id"
     AND stage."code" = 'EXECUTION'
    WHERE work_item."status" = 'V3_RUNTIME'
       OR stage."id" IS NULL
       OR report."review_status" NOT IN ('ACCEPTED', 'INFORMATION_REQUESTED')
       OR report."reviewed_by_account_id" IS NULL
       OR report."reviewed_at" IS NULL
       OR report."reviewed_at" < report."created_at"
       OR report."manager_note" IS NULL
       OR btrim(report."manager_note") = ''
       OR length(report."manager_note") > 1000
  ) THEN
    RAISE EXCEPTION
      'P8-E found a completion report outside the proven reviewed legacy completion contract.';
  END IF;

  -- Each surviving report must still have its matching COMPLETION_SUBMITTED
  -- WorkActivity. This lets event timestamps/actors remain source-evidence based.
  IF EXISTS (
    SELECT 1
    FROM "work_completion_reports" report
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS activity_count
      FROM "work_activities" activity
      WHERE activity."work_item_id" = report."work_item_id"
        AND activity."action" = 'COMPLETION_SUBMITTED'
        AND activity."details" ->> 'completionReportId' = report."id"::text
    ) matched ON true
    WHERE matched.activity_count <> 1
  ) THEN
    RAISE EXCEPTION
      'P8-E requires exactly one matching COMPLETION_SUBMITTED WorkActivity for every surviving completion report.';
  END IF;

  ---------------------------------------------------------------------------
  -- 1. Current Work-level field values from proven legacy WorkItem columns.
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE p8e_intake_source ON COMMIT DROP AS
  WITH source_rows AS (
    SELECT work_item."id" AS work_item_id, work_item."work_type_version_id",
           'CUSTOMER_NAME'::text AS field_code,
           to_jsonb(btrim(work_item."customer_name")) AS value,
           work_item."created_by_account_id" AS actor_account_id,
           work_item."created_at" AS source_created_at,
           work_item."updated_at" AS source_updated_at
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."customer_name" IS NOT NULL
      AND btrim(work_item."customer_name") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'CUSTOMER_CONTACT_TYPE', to_jsonb(work_item."customer_contact_type"::text),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."customer_contact_type" IS NOT NULL

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'CUSTOMER_CONTACT_NUMBER', to_jsonb(btrim(work_item."customer_contact_number")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."customer_contact_number" IS NOT NULL
      AND btrim(work_item."customer_contact_number") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'LOCATION', to_jsonb(btrim(work_item."location_text")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."location_text" IS NOT NULL
      AND btrim(work_item."location_text") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'REGISTERED_AT',
           to_jsonb(to_char(work_item."registered_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."registered_at" IS NOT NULL

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'OLT', to_jsonb(btrim(work_item."olt")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."olt" IS NOT NULL
      AND btrim(work_item."olt") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'FDC_NAME', to_jsonb(btrim(work_item."fdc_name")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."fdc_name" IS NOT NULL
      AND btrim(work_item."fdc_name") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'FAP_NAME', to_jsonb(btrim(work_item."fap_name")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."fap_name" IS NOT NULL
      AND btrim(work_item."fap_name") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'SERVICE_NUMBER', to_jsonb(btrim(work_item."service_number")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."service_number" IS NOT NULL
      AND btrim(work_item."service_number") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'TOKEN_NUMBER', to_jsonb(btrim(work_item."request_number")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."type" IN ('NEW_CONNECTION', 'UPDATE_SERVICES')
      AND work_item."request_number" IS NOT NULL
      AND btrim(work_item."request_number") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'CPC_SERIAL', to_jsonb(btrim(work_item."cpc_serial")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."type" = 'NEW_CONNECTION'
      AND work_item."cpc_serial" IS NOT NULL
      AND btrim(work_item."cpc_serial") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'SERVICE_TYPES', to_jsonb(work_item."service_types"),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."service_types" IS NOT NULL
      AND cardinality(work_item."service_types") > 0

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'OTHER_SERVICE_TEXT', to_jsonb(btrim(work_item."other_service_text")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."other_service_text" IS NOT NULL
      AND btrim(work_item."other_service_text") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'TASK_TITLE', to_jsonb(btrim(work_item."title")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."type" = 'ADMINISTRATIVE_TASK'
      AND btrim(work_item."title") <> ''

    UNION ALL
    SELECT work_item."id", work_item."work_type_version_id",
           'TASK_DESCRIPTION', to_jsonb(btrim(work_item."description")),
           work_item."created_by_account_id", work_item."created_at", work_item."updated_at"
    FROM "work_items" work_item
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."type" = 'ADMINISTRATIVE_TASK'
      AND btrim(work_item."description") <> ''
  )
  SELECT
    source_rows.work_item_id,
    field_definition."id" AS field_definition_id,
    field_definition."code" AS field_code,
    field_definition."field_type" AS field_type,
    source_rows.value,
    source_rows.actor_account_id,
    source_rows.source_created_at,
    source_rows.source_updated_at
  FROM source_rows
  JOIN "work_field_definitions" field_definition
    ON field_definition."work_type_version_id" = source_rows.work_type_version_id
   AND field_definition."code" = source_rows.field_code
   AND field_definition."stage_definition_id" IS NULL;

  IF EXISTS (
    SELECT 1
    FROM p8e_intake_source source_row
    GROUP BY source_row.work_item_id, source_row.field_definition_id
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION
      'P8-E produced duplicate current intake field values.';
  END IF;

  -- Explicitly prove the token source and New Installation service-number rule.
  IF (
    SELECT COUNT(*)
    FROM p8e_intake_source source_row
    JOIN "work_field_definitions" field_definition
      ON field_definition."id" = source_row.field_definition_id
    JOIN "work_items" work_item
      ON work_item."id" = source_row.work_item_id
    WHERE field_definition."code" = 'TOKEN_NUMBER'
      AND work_item."type" IN ('NEW_CONNECTION', 'UPDATE_SERVICES')
  ) <> 13 THEN
    RAISE EXCEPTION
      'P8-E expected 13 TOKEN_NUMBER values sourced from request_number.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p8e_intake_source source_row
    JOIN "work_field_definitions" field_definition
      ON field_definition."id" = source_row.field_definition_id
    JOIN "work_items" work_item
      ON work_item."id" = source_row.work_item_id
    WHERE work_item."type" = 'NEW_CONNECTION'
      AND field_definition."code" = 'SERVICE_NUMBER'
  ) THEN
    RAISE EXCEPTION
      'P8-E must not project legacy New Installation service_number into V3.';
  END IF;

  SELECT COUNT(*) INTO projected_intake_value_count
  FROM p8e_intake_source;

  INSERT INTO "work_field_values" (
    "id",
    "work_item_id",
    "field_definition_id",
    "work_stage_id",
    "value",
    "version",
    "updated_by_account_id",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    source_row.work_item_id,
    source_row.field_definition_id,
    NULL,
    source_row.value,
    1,
    source_row.actor_account_id,
    source_row.source_created_at,
    source_row.source_updated_at
  FROM p8e_intake_source source_row;

  ---------------------------------------------------------------------------
  -- 2. Current EXECUTION completion values use the latest surviving report.
  --    Earlier immutable report values are preserved in submission snapshots.
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE p8e_latest_report ON COMMIT DROP AS
  SELECT ranked.*
  FROM (
    SELECT
      report.*,
      ROW_NUMBER() OVER (
        PARTITION BY report."work_item_id"
        ORDER BY report."created_at" DESC, report."id" DESC
      ) AS row_number
    FROM "work_completion_reports" report
  ) ranked
  WHERE ranked.row_number = 1;

  CREATE TEMP TABLE p8e_completion_source ON COMMIT DROP AS
  WITH source_rows AS (
    SELECT report."work_item_id", 'COMPLETION_RESULT'::text AS field_code,
           to_jsonb(report."result"::text) AS value,
           report."submitted_by_account_id" AS actor_account_id,
           report."created_at" AS source_created_at,
           report."updated_at" AS source_updated_at
    FROM p8e_latest_report report

    UNION ALL
    SELECT report."work_item_id", 'COMPLETION_SUMMARY', to_jsonb(report."summary"),
           report."submitted_by_account_id", report."created_at", report."updated_at"
    FROM p8e_latest_report report

    UNION ALL
    SELECT report."work_item_id", 'MORE_WORK_REQUIRED', to_jsonb(report."more_work_required"),
           report."submitted_by_account_id", report."created_at", report."updated_at"
    FROM p8e_latest_report report

    UNION ALL
    SELECT report."work_item_id", 'RX_LEVEL_DBM', to_jsonb(report."rx_level_dbm"),
           report."submitted_by_account_id", report."created_at", report."updated_at"
    FROM p8e_latest_report report
    WHERE report."rx_level_dbm" IS NOT NULL

    UNION ALL
    SELECT report."work_item_id", 'CUSTOMER_ID', to_jsonb(btrim(report."customer_id")),
           report."submitted_by_account_id", report."created_at", report."updated_at"
    FROM p8e_latest_report report
    WHERE report."customer_id" IS NOT NULL
      AND btrim(report."customer_id") <> ''
  )
  SELECT
    source_rows.work_item_id,
    stage."id" AS work_stage_id,
    field_definition."id" AS field_definition_id,
    field_definition."code" AS field_code,
    field_definition."field_type" AS field_type,
    source_rows.value,
    source_rows.actor_account_id,
    source_rows.source_created_at,
    source_rows.source_updated_at
  FROM source_rows
  JOIN "work_items" work_item
    ON work_item."id" = source_rows.work_item_id
  JOIN "work_stages" stage
    ON stage."work_item_id" = source_rows.work_item_id
   AND stage."code" = 'EXECUTION'
  JOIN "work_field_definitions" field_definition
    ON field_definition."work_type_version_id" = work_item."work_type_version_id"
   AND field_definition."stage_definition_id" = stage."stage_definition_id"
   AND field_definition."code" = source_rows.field_code;

  IF EXISTS (
    SELECT 1
    FROM p8e_completion_source source_row
    GROUP BY source_row.work_item_id, source_row.field_definition_id
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION
      'P8-E produced duplicate current completion field values.';
  END IF;

  SELECT COUNT(*) INTO projected_completion_value_count
  FROM p8e_completion_source;

  INSERT INTO "work_field_values" (
    "id",
    "work_item_id",
    "field_definition_id",
    "work_stage_id",
    "value",
    "version",
    "updated_by_account_id",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    source_row.work_item_id,
    source_row.field_definition_id,
    source_row.work_stage_id,
    source_row.value,
    1,
    source_row.actor_account_id,
    source_row.source_created_at,
    source_row.source_updated_at
  FROM p8e_completion_source source_row;

  ---------------------------------------------------------------------------
  -- 3. Indexed references for every copied REFERENCE field value.
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE p8e_reference_source ON COMMIT DROP AS
  SELECT
    source_row.work_item_id,
    source_row.field_definition_id,
    source_row.field_code AS reference_type,
    source_row.value #>> '{}' AS value,
    upper(regexp_replace(btrim(source_row.value #>> '{}'), '[[:space:]]+', ' ', 'g')) AS normalized_value,
    source_row.actor_account_id,
    source_row.source_created_at,
    source_row.source_updated_at
  FROM p8e_intake_source source_row
  WHERE source_row.field_type = 'REFERENCE'

  UNION ALL

  SELECT
    source_row.work_item_id,
    source_row.field_definition_id,
    source_row.field_code,
    source_row.value #>> '{}',
    upper(regexp_replace(btrim(source_row.value #>> '{}'), '[[:space:]]+', ' ', 'g')),
    source_row.actor_account_id,
    source_row.source_created_at,
    source_row.source_updated_at
  FROM p8e_completion_source source_row
  WHERE source_row.field_type = 'REFERENCE';

  IF EXISTS (
    SELECT 1
    FROM p8e_reference_source reference_source
    WHERE reference_source.value IS NULL
       OR btrim(reference_source.value) = ''
       OR btrim(reference_source.normalized_value) = ''
  ) THEN
    RAISE EXCEPTION
      'P8-E produced an empty WorkReference.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p8e_reference_source reference_source
    GROUP BY reference_source.work_item_id,
             reference_source.reference_type,
             reference_source.normalized_value
    HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION
      'P8-E produced duplicate WorkReference identities.';
  END IF;

  SELECT COUNT(*) INTO projected_reference_count
  FROM p8e_reference_source;

  INSERT INTO "work_references" (
    "id",
    "work_item_id",
    "reference_type",
    "value",
    "normalized_value",
    "source_field_definition_id",
    "created_by_account_id",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    reference_source.work_item_id,
    reference_source.reference_type,
    reference_source.value,
    reference_source.normalized_value,
    reference_source.field_definition_id,
    reference_source.actor_account_id,
    reference_source.source_created_at,
    reference_source.source_updated_at
  FROM p8e_reference_source reference_source;

  ---------------------------------------------------------------------------
  -- 4. Immutable submission snapshots for the 22 surviving completion reports.
  --
  -- submission_number is consecutive among surviving V3 submission rows. The
  -- historical ordinal from WorkActivity is preserved separately in events.
  -- This avoids creating a fake missing submission row and avoids a future
  -- runtime count()+1 collision on the one orphan historical attempt.
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE p8e_report_projection ON COMMIT DROP AS
  WITH report_rank AS (
    SELECT
      report.*,
      ROW_NUMBER() OVER (
        PARTITION BY report."work_item_id"
        ORDER BY report."created_at", report."id"
      )::integer AS submission_number
    FROM "work_completion_reports" report
  ),
  submit_activity AS (
    SELECT
      activity."id" AS activity_id,
      activity."work_item_id",
      activity."actor_account_id",
      activity."details" ->> 'completionReportId' AS completion_report_id,
      activity."created_at",
      ROW_NUMBER() OVER (
        PARTITION BY activity."work_item_id"
        ORDER BY activity."created_at", activity."id"
      )::integer AS legacy_submission_ordinal
    FROM "work_activities" activity
    WHERE activity."action" = 'COMPLETION_SUBMITTED'
  )
  SELECT
    report_rank."id" AS completion_report_id,
    report_rank."work_item_id",
    stage."id" AS work_stage_id,
    stage."stage_definition_id",
    stage."version" AS stage_version,
    report_rank.submission_number,
    report_rank."submitted_by_account_id",
    report_rank."review_status",
    report_rank."manager_note",
    report_rank."reviewed_by_account_id",
    report_rank."reviewed_at",
    report_rank."created_at" AS report_created_at,
    report_rank."updated_at" AS report_updated_at,
    submit_activity.activity_id AS submit_activity_id,
    submit_activity.actor_account_id AS submit_activity_actor_id,
    submit_activity.created_at AS submit_activity_created_at,
    submit_activity.legacy_submission_ordinal
  FROM report_rank
  JOIN "work_stages" stage
    ON stage."work_item_id" = report_rank."work_item_id"
   AND stage."code" = 'EXECUTION'
  JOIN submit_activity
    ON submit_activity.work_item_id = report_rank."work_item_id"
   AND submit_activity.completion_report_id = report_rank."id"::text;

  IF (SELECT COUNT(*) FROM p8e_report_projection) <> legacy_completion_report_count THEN
    RAISE EXCEPTION
      'P8-E completion-report projection count mismatch.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p8e_report_projection projection
    WHERE projection.submit_activity_actor_id IS DISTINCT FROM projection.submitted_by_account_id
  ) THEN
    RAISE EXCEPTION
      'P8-E completion-report submitter does not match the linked WorkActivity actor.';
  END IF;

  CREATE TEMP TABLE p8e_submission_snapshot ON COMMIT DROP AS
  SELECT
    projection.completion_report_id,
    projection.work_item_id,
    projection.work_stage_id,
    projection.stage_version,
    projection.submission_number,
    projection.submitted_by_account_id,
    projection.report_created_at,
    jsonb_build_object(
      'fields',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'fieldDefinitionId', field_definition."id"::text,
              'code', field_definition."code",
              'fieldType', field_definition."field_type"::text,
              'value', value_source.value
            )
            ORDER BY field_definition."sort_order", field_definition."code"
          )
          FROM (
            SELECT 'COMPLETION_RESULT'::text AS field_code,
                   to_jsonb(report."result"::text) AS value
            UNION ALL
            SELECT 'COMPLETION_SUMMARY', to_jsonb(report."summary")
            UNION ALL
            SELECT 'MORE_WORK_REQUIRED', to_jsonb(report."more_work_required")
            UNION ALL
            SELECT 'RX_LEVEL_DBM', to_jsonb(report."rx_level_dbm")
            WHERE report."rx_level_dbm" IS NOT NULL
            UNION ALL
            SELECT 'CUSTOMER_ID', to_jsonb(btrim(report."customer_id"))
            WHERE report."customer_id" IS NOT NULL
              AND btrim(report."customer_id") <> ''
          ) value_source
          JOIN "work_field_definitions" field_definition
            ON field_definition."stage_definition_id" = projection.stage_definition_id
           AND field_definition."code" = value_source.field_code
        ),
        '[]'::jsonb
      )
    ) AS values_snapshot
  FROM p8e_report_projection projection
  JOIN "work_completion_reports" report
    ON report."id" = projection.completion_report_id;

  IF EXISTS (
    SELECT 1
    FROM p8e_submission_snapshot snapshot
    WHERE jsonb_typeof(snapshot.values_snapshot -> 'fields') <> 'array'
       OR jsonb_array_length(snapshot.values_snapshot -> 'fields') < 3
  ) THEN
    RAISE EXCEPTION
      'P8-E produced an invalid completion submission snapshot.';
  END IF;

  SELECT COUNT(*) INTO projected_submission_count
  FROM p8e_submission_snapshot;

  INSERT INTO "work_stage_submissions" (
    "id",
    "work_stage_id",
    "submitted_by_account_id",
    "submission_number",
    "stage_version",
    "values_snapshot",
    "note",
    "created_at"
  )
  SELECT
    snapshot.completion_report_id,
    snapshot.work_stage_id,
    snapshot.submitted_by_account_id,
    snapshot.submission_number,
    snapshot.stage_version,
    snapshot.values_snapshot,
    NULL,
    snapshot.report_created_at
  FROM p8e_submission_snapshot snapshot;

  ---------------------------------------------------------------------------
  -- 5. Immutable manager review: ACCEPTED -> APPROVED,
  --    INFORMATION_REQUESTED -> RETURNED.
  ---------------------------------------------------------------------------
  SELECT COUNT(*) INTO projected_approval_count
  FROM p8e_report_projection;

  INSERT INTO "work_stage_approvals" (
    "id",
    "work_stage_id",
    "submission_id",
    "decided_by_account_id",
    "decision",
    "reason",
    "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_stage_id,
    projection.completion_report_id,
    projection.reviewed_by_account_id,
    CASE projection.review_status
      WHEN 'ACCEPTED' THEN 'APPROVED'::"WorkStageApprovalDecision"
      WHEN 'INFORMATION_REQUESTED' THEN 'RETURNED'::"WorkStageApprovalDecision"
    END,
    projection.manager_note,
    projection.reviewed_at
  FROM p8e_report_projection projection;

  ---------------------------------------------------------------------------
  -- 6. V3 events for the 22 surviving report submissions/reviews.
  ---------------------------------------------------------------------------
  SELECT COUNT(*) INTO projected_report_submit_event_count
  FROM p8e_report_projection;

  INSERT INTO "work_events" (
    "id",
    "work_item_id",
    "work_stage_id",
    "actor_account_id",
    "event_type",
    "from_stage_status",
    "to_stage_status",
    "details",
    "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.work_stage_id,
    projection.submitted_by_account_id,
    'STAGE_SUBMITTED'::"WorkEventType",
    'IN_PROGRESS'::"WorkStageStatus",
    'SUBMITTED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_COMPLETION_REPORT_HISTORY',
      'projectionKind', 'RUNTIME_SUBMISSION',
      'legacyCompletionReportId', projection.completion_report_id::text,
      'legacyWorkActivityId', projection.submit_activity_id::text,
      'submissionId', projection.completion_report_id::text,
      'submissionNumber', projection.submission_number,
      'stageVersion', projection.stage_version,
      'legacySubmissionOrdinal', projection.legacy_submission_ordinal
    ),
    projection.submit_activity_created_at
  FROM p8e_report_projection projection;

  SELECT COUNT(*) INTO projected_report_review_event_count
  FROM p8e_report_projection;

  INSERT INTO "work_events" (
    "id",
    "work_item_id",
    "work_stage_id",
    "actor_account_id",
    "event_type",
    "from_stage_status",
    "to_stage_status",
    "details",
    "created_at"
  )
  SELECT
    gen_random_uuid(),
    projection.work_item_id,
    projection.work_stage_id,
    projection.reviewed_by_account_id,
    CASE projection.review_status
      WHEN 'ACCEPTED' THEN 'STAGE_APPROVED'::"WorkEventType"
      WHEN 'INFORMATION_REQUESTED' THEN 'STAGE_RETURNED'::"WorkEventType"
    END,
    'SUBMITTED'::"WorkStageStatus",
    CASE projection.review_status
      WHEN 'ACCEPTED' THEN 'COMPLETED'::"WorkStageStatus"
      WHEN 'INFORMATION_REQUESTED' THEN 'RETURNED'::"WorkStageStatus"
    END,
    jsonb_build_object(
      'source', 'WM_V2_COMPLETION_REPORT_HISTORY',
      'projectionKind', 'RUNTIME_REVIEW',
      'legacyCompletionReportId', projection.completion_report_id::text,
      'submissionId', projection.completion_report_id::text,
      'submissionNumber', projection.submission_number,
      'legacyReviewStatus', projection.review_status::text,
      'reason', projection.manager_note
    ),
    projection.reviewed_at
  FROM p8e_report_projection projection;

  ---------------------------------------------------------------------------
  -- 7. Preserve the one historical submission/return whose completion-report
  --    payload no longer survives. No WorkStageSubmission is fabricated.
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE p8e_orphan_submit ON COMMIT DROP AS
  WITH submit_activity AS (
    SELECT
      activity.*,
      ROW_NUMBER() OVER (
        PARTITION BY activity."work_item_id"
        ORDER BY activity."created_at", activity."id"
      )::integer AS legacy_submission_ordinal
    FROM "work_activities" activity
    WHERE activity."action" = 'COMPLETION_SUBMITTED'
  )
  SELECT
    submit_activity."id" AS activity_id,
    submit_activity."work_item_id",
    stage."id" AS work_stage_id,
    submit_activity."actor_account_id",
    submit_activity."details",
    submit_activity."created_at",
    submit_activity.legacy_submission_ordinal,
    submit_activity."details" ->> 'completionReportId' AS completion_report_id
  FROM submit_activity
  JOIN "work_stages" stage
    ON stage."work_item_id" = submit_activity."work_item_id"
   AND stage."code" = 'EXECUTION'
  LEFT JOIN "work_completion_reports" report
    ON report."id"::text = submit_activity."details" ->> 'completionReportId'
  WHERE report."id" IS NULL;

  IF (SELECT COUNT(*) FROM p8e_orphan_submit) <> 1 THEN
    RAISE EXCEPTION
      'P8-E expected exactly one history-only orphan COMPLETION_SUBMITTED activity.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p8e_orphan_submit orphan
    WHERE orphan.completion_report_id IS NULL
       OR btrim(orphan.completion_report_id) = ''
  ) THEN
    RAISE EXCEPTION
      'P8-E orphan completion activity has no legacy completionReportId evidence.';
  END IF;

  CREATE TEMP TABLE p8e_orphan_return ON COMMIT DROP AS
  SELECT
    activity."id" AS activity_id,
    activity."work_item_id",
    orphan.work_stage_id,
    activity."actor_account_id",
    activity."details",
    activity."created_at",
    orphan.completion_report_id,
    orphan.legacy_submission_ordinal
  FROM p8e_orphan_submit orphan
  JOIN "work_activities" activity
    ON activity."work_item_id" = orphan.work_item_id
   AND activity."action" = 'INFORMATION_REQUESTED'
   AND activity."details" ->> 'completionReportId' = orphan.completion_report_id;

  IF (SELECT COUNT(*) FROM p8e_orphan_return) <> 1 THEN
    RAISE EXCEPTION
      'P8-E expected exactly one INFORMATION_REQUESTED activity for the orphan historical submission.';
  END IF;

  SELECT COUNT(*) INTO projected_orphan_submit_event_count
  FROM p8e_orphan_submit;

  INSERT INTO "work_events" (
    "id",
    "work_item_id",
    "work_stage_id",
    "actor_account_id",
    "event_type",
    "from_stage_status",
    "to_stage_status",
    "details",
    "created_at"
  )
  SELECT
    gen_random_uuid(),
    orphan.work_item_id,
    orphan.work_stage_id,
    orphan.actor_account_id,
    'STAGE_SUBMITTED'::"WorkEventType",
    'IN_PROGRESS'::"WorkStageStatus",
    'SUBMITTED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_COMPLETION_ACTIVITY_HISTORY',
      'projectionKind', 'HISTORY_ONLY',
      'legacyWorkActivityId', orphan.activity_id::text,
      'legacyCompletionReportId', orphan.completion_report_id,
      'legacySubmissionOrdinal', orphan.legacy_submission_ordinal,
      'legacyDetails', orphan.details
    ),
    orphan.created_at
  FROM p8e_orphan_submit orphan;

  SELECT COUNT(*) INTO projected_orphan_return_event_count
  FROM p8e_orphan_return;

  INSERT INTO "work_events" (
    "id",
    "work_item_id",
    "work_stage_id",
    "actor_account_id",
    "event_type",
    "from_stage_status",
    "to_stage_status",
    "details",
    "created_at"
  )
  SELECT
    gen_random_uuid(),
    orphan_return.work_item_id,
    orphan_return.work_stage_id,
    orphan_return.actor_account_id,
    'STAGE_RETURNED'::"WorkEventType",
    'SUBMITTED'::"WorkStageStatus",
    'RETURNED'::"WorkStageStatus",
    jsonb_build_object(
      'source', 'WM_V2_COMPLETION_ACTIVITY_HISTORY',
      'projectionKind', 'HISTORY_ONLY',
      'legacyWorkActivityId', orphan_return.activity_id::text,
      'legacyCompletionReportId', orphan_return.completion_report_id,
      'legacySubmissionOrdinal', orphan_return.legacy_submission_ordinal,
      'reason', orphan_return.details ->> 'note',
      'legacyDetails', orphan_return.details
    ),
    orphan_return.created_at
  FROM p8e_orphan_return orphan_return;

  ---------------------------------------------------------------------------
  -- 8. Reconciliation / no-loss gates.
  ---------------------------------------------------------------------------
  IF (
    SELECT COUNT(*)
    FROM "work_field_values" field_value
    JOIN "work_items" work_item
      ON work_item."id" = field_value."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) <> projected_intake_value_count + projected_completion_value_count THEN
    RAISE EXCEPTION
      'P8-E V3 field-value reconciliation failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_references" reference_record
    JOIN "work_items" work_item
      ON work_item."id" = reference_record."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) <> projected_reference_count THEN
    RAISE EXCEPTION
      'P8-E WorkReference reconciliation failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_stage_submissions" submission
    JOIN "work_stages" stage ON stage."id" = submission."work_stage_id"
    JOIN "work_items" work_item ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) <> projected_submission_count THEN
    RAISE EXCEPTION
      'P8-E WorkStageSubmission reconciliation failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_stage_approvals" approval
    JOIN "work_stages" stage ON stage."id" = approval."work_stage_id"
    JOIN "work_items" work_item ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
  ) <> projected_approval_count THEN
    RAISE EXCEPTION
      'P8-E WorkStageApproval reconciliation failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_stage_approvals" approval
    JOIN "work_stages" stage ON stage."id" = approval."work_stage_id"
    JOIN "work_items" work_item ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND approval."decision" = 'APPROVED'
  ) <> 21 THEN
    RAISE EXCEPTION
      'P8-E expected 21 APPROVED legacy manager-review projections.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_stage_approvals" approval
    JOIN "work_stages" stage ON stage."id" = approval."work_stage_id"
    JOIN "work_items" work_item ON work_item."id" = stage."work_item_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND approval."decision" = 'RETURNED'
  ) <> 1 THEN
    RAISE EXCEPTION
      'P8-E expected 1 RETURNED surviving manager-review projection.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_events" event_record
    WHERE event_record."details" ->> 'source' = 'WM_V2_COMPLETION_REPORT_HISTORY'
      AND event_record."event_type" = 'STAGE_SUBMITTED'
  ) <> projected_report_submit_event_count THEN
    RAISE EXCEPTION
      'P8-E surviving report STAGE_SUBMITTED event reconciliation failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_events" event_record
    WHERE event_record."details" ->> 'source' = 'WM_V2_COMPLETION_REPORT_HISTORY'
      AND event_record."event_type" IN ('STAGE_APPROVED', 'STAGE_RETURNED')
  ) <> projected_report_review_event_count THEN
    RAISE EXCEPTION
      'P8-E surviving report review-event reconciliation failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_events" event_record
    WHERE event_record."details" ->> 'source' = 'WM_V2_COMPLETION_ACTIVITY_HISTORY'
      AND event_record."event_type" = 'STAGE_SUBMITTED'
  ) <> projected_orphan_submit_event_count THEN
    RAISE EXCEPTION
      'P8-E history-only orphan STAGE_SUBMITTED event reconciliation failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_events" event_record
    WHERE event_record."details" ->> 'source' = 'WM_V2_COMPLETION_ACTIVITY_HISTORY'
      AND event_record."event_type" = 'STAGE_RETURNED'
  ) <> projected_orphan_return_event_count THEN
    RAISE EXCEPTION
      'P8-E history-only orphan STAGE_RETURNED event reconciliation failed.';
  END IF;

  -- New Installation must still have no projected SERVICE_NUMBER even though
  -- one legacy row retains that historical column value.
  IF EXISTS (
    SELECT 1
    FROM "work_field_values" field_value
    JOIN "work_items" work_item ON work_item."id" = field_value."work_item_id"
    JOIN "work_field_definitions" field_definition
      ON field_definition."id" = field_value."field_definition_id"
    WHERE work_item."status" <> 'V3_RUNTIME'
      AND work_item."type" = 'NEW_CONNECTION'
      AND field_definition."code" = 'SERVICE_NUMBER'
  ) THEN
    RAISE EXCEPTION
      'P8-E reconciliation found a forbidden V3 New Installation SERVICE_NUMBER value.';
  END IF;

  -- Source-of-truth legacy evidence must remain untouched.
  IF (SELECT COUNT(*) FROM "work_items" WHERE "status" <> 'V3_RUNTIME') <> legacy_work_count THEN
    RAISE EXCEPTION
      'P8-E changed the legacy Work row count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_completion_reports") <> legacy_completion_report_count THEN
    RAISE EXCEPTION
      'P8-E changed the legacy completion-report count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_activities") <> legacy_work_activity_count THEN
    RAISE EXCEPTION
      'P8-E changed the legacy WorkActivity count.';
  END IF;

  RAISE NOTICE
    'P8-E complete: % intake values, % completion values, % references, % submissions, % approvals, % report submit events, % report review events, % orphan submit event, % orphan return event.',
    projected_intake_value_count,
    projected_completion_value_count,
    projected_reference_count,
    projected_submission_count,
    projected_approval_count,
    projected_report_submit_event_count,
    projected_report_review_event_count,
    projected_orphan_submit_event_count,
    projected_orphan_return_event_count;
END $$;
