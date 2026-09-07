-- Phase 6 / P6-D-D: close the delta window between the migration 87
-- compatibility backfill and the WM-V2 write cutover. Any legacy Work created
-- in that window is compatibility-bound now that new WM-V2 creation is closed.
-- No Work row or legacy business field is deleted.

DO $$
DECLARE
  total_work_before INTEGER;
  native_v3_before INTEGER;
  legacy_total INTEGER;
  delta_candidate_count INTEGER;
  delta_resolved_count INTEGER;
  compatibility_bound_count INTEGER;
  primary_participant_count INTEGER;
  compatibility_event_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_work_before FROM "work_items";

  SELECT COUNT(*)
  INTO native_v3_before
  FROM "work_items"
  WHERE "status" = 'V3_RUNTIME';

  SELECT COUNT(*)
  INTO legacy_total
  FROM "work_items"
  WHERE "status" <> 'V3_RUNTIME';

  SELECT COUNT(*)
  INTO delta_candidate_count
  FROM "work_items"
  WHERE "status" <> 'V3_RUNTIME'
    AND (
      "office_id" IS NULL
      OR "work_type_version_id" IS NULL
      OR "primary_owner_org_unit_id" IS NULL
      OR "runtime_status" IS NULL
    );

  CREATE TEMP TABLE p6d_cutover_delta_resolution ON COMMIT DROP AS
  SELECT
    work_item."id" AS work_item_id,
    COALESCE(
      team_mapping."office_id",
      department_mapping."office_id",
      division_mapping."office_id"
    ) AS office_id,
    version_record."id" AS work_type_version_id,
    COALESCE(
      team_mapping."org_unit_id",
      department_mapping."org_unit_id",
      version_record."primary_owner_org_unit_id"
    ) AS primary_owner_org_unit_id,
    CASE work_item."status"
      WHEN 'ASSIGNED' THEN 'OPEN'::"WorkRuntimeStatus"
      WHEN 'ACKNOWLEDGED' THEN 'OPEN'::"WorkRuntimeStatus"
      WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::"WorkRuntimeStatus"
      WHEN 'HELP_REQUESTED' THEN 'WAITING'::"WorkRuntimeStatus"
      WHEN 'COMPLETED_PENDING_REVIEW' THEN 'WAITING'::"WorkRuntimeStatus"
      WHEN 'CLOSED' THEN 'COMPLETED'::"WorkRuntimeStatus"
      WHEN 'REOPENED' THEN 'IN_PROGRESS'::"WorkRuntimeStatus"
      WHEN 'BLOCKED' THEN 'BLOCKED'::"WorkRuntimeStatus"
      WHEN 'CANCELLED' THEN 'CANCELLED'::"WorkRuntimeStatus"
      ELSE 'OPEN'::"WorkRuntimeStatus"
    END AS runtime_status,
    COALESCE(work_item."registered_at", work_item."created_at") AS opened_at
  FROM "work_items" work_item
  LEFT JOIN "legacy_org_unit_mappings" team_mapping
    ON team_mapping."legacy_entity_type" = 'TEAM'
   AND team_mapping."legacy_entity_id" = work_item."assigned_team_id"
  LEFT JOIN "legacy_org_unit_mappings" department_mapping
    ON department_mapping."legacy_entity_type" = 'DEPARTMENT'
   AND department_mapping."legacy_entity_id" = work_item."department_id"
  LEFT JOIN "legacy_org_unit_mappings" division_mapping
    ON division_mapping."legacy_entity_type" = 'DIVISION'
   AND division_mapping."legacy_entity_id" = work_item."division_id"
  LEFT JOIN "work_type_definitions" definition
    ON definition."office_id" = COALESCE(
         team_mapping."office_id",
         department_mapping."office_id",
         division_mapping."office_id"
       )
   AND definition."legacy_work_item_type" = work_item."type"
  LEFT JOIN "work_type_versions" version_record
    ON version_record."work_type_definition_id" = definition."id"
   AND version_record."version" = 1
   AND version_record."status" = 'PUBLISHED'
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND (
      work_item."office_id" IS NULL
      OR work_item."work_type_version_id" IS NULL
      OR work_item."primary_owner_org_unit_id" IS NULL
      OR work_item."runtime_status" IS NULL
    );

  SELECT COUNT(*)
  INTO delta_resolved_count
  FROM p6d_cutover_delta_resolution resolution
  WHERE resolution.office_id IS NOT NULL
    AND resolution.work_type_version_id IS NOT NULL
    AND resolution.primary_owner_org_unit_id IS NOT NULL;

  IF delta_resolved_count <> delta_candidate_count THEN
    RAISE EXCEPTION
      'P6-D cutover delta resolution failed: expected %, resolved %.',
      delta_candidate_count,
      delta_resolved_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p6d_cutover_delta_resolution resolution
    JOIN "org_units" owner_unit
      ON owner_unit."id" = resolution.primary_owner_org_unit_id
    WHERE owner_unit."office_id" <> resolution.office_id
  ) THEN
    RAISE EXCEPTION
      'P6-D cutover delta produced a Primary Owner outside the Work Office.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p6d_cutover_delta_resolution resolution
    JOIN "work_type_versions" version_record
      ON version_record."id" = resolution.work_type_version_id
    JOIN "work_type_definitions" definition
      ON definition."id" = version_record."work_type_definition_id"
    WHERE definition."office_id" <> resolution.office_id
  ) THEN
    RAISE EXCEPTION
      'P6-D cutover delta produced a Work Type Version outside the Work Office.';
  END IF;

  UPDATE "work_items" work_item
  SET
    "office_id" = resolution.office_id,
    "work_type_version_id" = resolution.work_type_version_id,
    "primary_owner_org_unit_id" = resolution.primary_owner_org_unit_id,
    "runtime_status" = resolution.runtime_status,
    "opened_at" = resolution.opened_at,
    "updated_at" = CURRENT_TIMESTAMP
  FROM p6d_cutover_delta_resolution resolution
  WHERE work_item."id" = resolution.work_item_id;

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
    work_item."id",
    work_item."primary_owner_org_unit_id",
    'PRIMARY_OWNER'::"WorkParticipantRole",
    work_item."created_by_account_id",
    COALESCE(work_item."opened_at", work_item."created_at"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_items" work_item
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND work_item."office_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "work_org_unit_participants" participant
      WHERE participant."work_item_id" = work_item."id"
        AND participant."role" = 'PRIMARY_OWNER'
        AND participant."ended_at" IS NULL
    );

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
    work_item."id",
    NULL,
    NULL,
    'WORK_STATUS_CHANGED'::"WorkEventType",
    NULL,
    work_item."runtime_status",
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'WM_V2_COMPATIBILITY_BACKFILL',
      'legacyStatus', work_item."status"::text,
      'legacyType', work_item."type"::text
    ),
    CURRENT_TIMESTAMP
  FROM "work_items" work_item
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND work_item."office_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "work_events" event_record
      WHERE event_record."work_item_id" = work_item."id"
        AND event_record."details" ->> 'source' = 'WM_V2_COMPATIBILITY_BACKFILL'
    );

  SELECT COUNT(*)
  INTO compatibility_bound_count
  FROM "work_items"
  WHERE "status" <> 'V3_RUNTIME'
    AND "office_id" IS NOT NULL
    AND "work_type_version_id" IS NOT NULL
    AND "primary_owner_org_unit_id" IS NOT NULL
    AND "runtime_status" IS NOT NULL;

  SELECT COUNT(*)
  INTO primary_participant_count
  FROM "work_items" work_item
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND EXISTS (
      SELECT 1
      FROM "work_org_unit_participants" participant
      WHERE participant."work_item_id" = work_item."id"
        AND participant."org_unit_id" = work_item."primary_owner_org_unit_id"
        AND participant."role" = 'PRIMARY_OWNER'
        AND participant."ended_at" IS NULL
    );

  SELECT COUNT(*)
  INTO compatibility_event_count
  FROM "work_items" work_item
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND EXISTS (
      SELECT 1
      FROM "work_events" event_record
      WHERE event_record."work_item_id" = work_item."id"
        AND event_record."details" ->> 'source' = 'WM_V2_COMPATIBILITY_BACKFILL'
    );

  IF compatibility_bound_count <> legacy_total THEN
    RAISE EXCEPTION
      'P6-D final legacy compatibility reconciliation failed: expected %, found %.',
      legacy_total,
      compatibility_bound_count;
  END IF;

  IF primary_participant_count <> legacy_total THEN
    RAISE EXCEPTION
      'P6-D final Primary Owner reconciliation failed: expected %, found %.',
      legacy_total,
      primary_participant_count;
  END IF;

  IF compatibility_event_count <> legacy_total THEN
    RAISE EXCEPTION
      'P6-D final compatibility event reconciliation failed: expected %, found %.',
      legacy_total,
      compatibility_event_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items"
    WHERE "status" = 'V3_RUNTIME'
      AND (
        "office_id" IS NULL
        OR "work_type_version_id" IS NULL
        OR "primary_owner_org_unit_id" IS NULL
        OR "runtime_status" IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'P6-D final reconciliation found native V3 Work with incomplete runtime context.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_items" WHERE "status" = 'V3_RUNTIME') <> native_v3_before THEN
    RAISE EXCEPTION
      'P6-D final reconciliation unexpectedly changed the native V3 Work count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_items") <> total_work_before THEN
    RAISE EXCEPTION
      'P6-D final reconciliation changed the total Work count.';
  END IF;
END $$;
