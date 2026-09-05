-- P5-C: backfill the eight current Work Management V2 work types into the
-- Work Type V3 configuration foundation for every currently active Office.
-- Existing WorkItem.type values remain unchanged and continue to drive runtime
-- behavior until the later Work Runtime V3 cutover.

DO $$
DECLARE
  backfill_actor_id UUID;
  active_office_count INTEGER;
  expected_definition_count INTEGER;
  actual_definition_count INTEGER;
  actual_version_count INTEGER;
BEGIN
  SELECT a."id"
  INTO backfill_actor_id
  FROM "accounts" a
  WHERE a."role" = 'SUPER_ADMIN'
  ORDER BY a."created_at" ASC, a."id" ASC
  LIMIT 1;

  IF backfill_actor_id IS NULL THEN
    RAISE EXCEPTION
      'P5-C Work Type V3 backfill requires an existing SUPER_ADMIN account for migration audit attribution.';
  END IF;

  SELECT COUNT(*)
  INTO active_office_count
  FROM "offices"
  WHERE "is_active" = true;

  IF active_office_count = 0 THEN
    RAISE EXCEPTION
      'P5-C Work Type V3 backfill requires at least one active Office.';
  END IF;

  expected_definition_count := active_office_count * 8;

  INSERT INTO "work_type_definitions" (
    "id",
    "office_id",
    "code",
    "legacy_work_item_type",
    "is_active",
    "sort_order",
    "created_by_account_id",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    office."id",
    seed."code",
    seed."legacy_type"::"WorkItemType",
    true,
    seed."sort_order",
    backfill_actor_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "offices" office
  CROSS JOIN (
    VALUES
      ('ROUTINE_WORK',         'ROUTINE_TASK',        10),
      ('TROUBLE_TICKET',       'TROUBLE_TICKET',      20),
      ('NETWORK_MAINTENANCE',  'MAINTENANCE',         30),
      ('NEW_INSTALLATION',     'NEW_CONNECTION',      40),
      ('UPDATE_SERVICES',      'UPDATE_SERVICES',     50),
      ('INSPECTION',           'INSPECTION',          60),
      ('EMERGENCY_WORK',       'EMERGENCY_WORK',      70),
      ('ADMINISTRATIVE_WORK',  'ADMINISTRATIVE_TASK', 80)
  ) AS seed("code", "legacy_type", "sort_order")
  WHERE office."is_active" = true;

  SELECT COUNT(*)
  INTO actual_definition_count
  FROM "work_type_definitions" definition
  JOIN "offices" office
    ON office."id" = definition."office_id"
  WHERE office."is_active" = true
    AND (
      (definition."code" = 'ROUTINE_WORK'        AND definition."legacy_work_item_type" = 'ROUTINE_TASK') OR
      (definition."code" = 'TROUBLE_TICKET'      AND definition."legacy_work_item_type" = 'TROUBLE_TICKET') OR
      (definition."code" = 'NETWORK_MAINTENANCE' AND definition."legacy_work_item_type" = 'MAINTENANCE') OR
      (definition."code" = 'NEW_INSTALLATION'    AND definition."legacy_work_item_type" = 'NEW_CONNECTION') OR
      (definition."code" = 'UPDATE_SERVICES'     AND definition."legacy_work_item_type" = 'UPDATE_SERVICES') OR
      (definition."code" = 'INSPECTION'          AND definition."legacy_work_item_type" = 'INSPECTION') OR
      (definition."code" = 'EMERGENCY_WORK'      AND definition."legacy_work_item_type" = 'EMERGENCY_WORK') OR
      (definition."code" = 'ADMINISTRATIVE_WORK' AND definition."legacy_work_item_type" = 'ADMINISTRATIVE_TASK')
    );

  IF actual_definition_count <> expected_definition_count THEN
    RAISE EXCEPTION
      'P5-C Work Type V3 definition reconciliation failed: expected %, found %.',
      expected_definition_count,
      actual_definition_count;
  END IF;

  INSERT INTO "work_type_versions" (
    "id",
    "work_type_definition_id",
    "version",
    "status",
    "name",
    "description",
    "change_reason",
    "created_by_account_id",
    "published_by_account_id",
    "retired_by_account_id",
    "published_at",
    "retired_at",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    definition."id",
    1,
    'PUBLISHED'::"WorkTypeVersionStatus",
    seed."name",
    NULL,
    'Legacy Work Management V2 compatibility backfill.',
    backfill_actor_id,
    backfill_actor_id,
    NULL,
    CURRENT_TIMESTAMP,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_type_definitions" definition
  JOIN "offices" office
    ON office."id" = definition."office_id"
  JOIN (
    VALUES
      ('ROUTINE_WORK',        'Routine Work'),
      ('TROUBLE_TICKET',      'Trouble Ticket'),
      ('NETWORK_MAINTENANCE', 'Network Maintenance'),
      ('NEW_INSTALLATION',    'New Installation'),
      ('UPDATE_SERVICES',     'Update Services'),
      ('INSPECTION',          'Inspection'),
      ('EMERGENCY_WORK',      'Emergency Work'),
      ('ADMINISTRATIVE_WORK', 'Administrative Work')
  ) AS seed("code", "name")
    ON seed."code" = definition."code"
  WHERE office."is_active" = true;

  SELECT COUNT(*)
  INTO actual_version_count
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  JOIN "offices" office
    ON office."id" = definition."office_id"
  WHERE office."is_active" = true
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  IF actual_version_count <> expected_definition_count THEN
    RAISE EXCEPTION
      'P5-C Work Type V3 version reconciliation failed: expected %, found %.',
      expected_definition_count,
      actual_version_count;
  END IF;
END $$;
