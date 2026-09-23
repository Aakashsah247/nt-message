-- Phase A: make the eight finalized Work Type Information definitions carry
-- explicit Creation / Completion / Both semantics. Existing explicit settings
-- are preserved; only legacy rows without collectionMode are normalized.

WITH system_fields AS (
  SELECT
    f."id",
    d."code" AS work_type_code,
    f."code" AS field_code
  FROM "work_field_definitions" f
  JOIN "work_type_versions" v
    ON v."id" = f."work_type_version_id"
  JOIN "work_type_definitions" d
    ON d."id" = v."work_type_definition_id"
  WHERE d."code" IN (
    'ROUTINE_WORK',
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'INSPECTION',
    'EMERGENCY_WORK',
    'ADMINISTRATIVE_WORK'
  )
    AND f."code" NOT IN (
      'COMPLETION_RESULT',
      'COMPLETION_SUMMARY',
      'MORE_WORK_REQUIRED'
    )
    AND NOT (COALESCE(f."config", '{}'::jsonb) ? 'collectionMode')
)
UPDATE "work_field_definitions" f
SET "config" = jsonb_set(
  COALESCE(f."config", '{}'::jsonb),
  '{collectionMode}',
  to_jsonb(
    CASE
      WHEN system_fields.field_code IN ('RX_LEVEL_DBM', 'CUSTOMER_ID')
        THEN 'COMPLETION_ONLY'
      WHEN system_fields.field_code = 'SALES_NOTE'
        THEN 'STAGE_ONLY'
      WHEN system_fields.field_code IN (
        'CUSTOMER_NAME',
        'LOCATION',
        'SERVICE_NUMBER',
        'TOKEN_NUMBER',
        'CPC_SERIAL',
        'OLT',
        'FDC_NAME',
        'FAP_NAME'
      )
        THEN 'CREATION_AND_COMPLETION'
      ELSE 'CREATION_ONLY'
    END::text
  ),
  true
),
"updated_at" = CURRENT_TIMESTAMP
FROM system_fields
WHERE f."id" = system_fields."id";

-- Old Finish Work displayed the saved customer/location/reference/network facts
-- without asking the employee to type them again. Preserve that behavior as the
-- default for Both fields while still allowing future published versions to
-- choose EDITABLE explicitly.
UPDATE "work_field_definitions" f
SET "config" = jsonb_set(
  COALESCE(f."config", '{}'::jsonb),
  '{completionMode}',
  '"READ_ONLY"'::jsonb,
  true
),
"updated_at" = CURRENT_TIMESTAMP
FROM "work_type_versions" v
JOIN "work_type_definitions" d
  ON d."id" = v."work_type_definition_id"
WHERE f."work_type_version_id" = v."id"
  AND d."code" IN (
    'ROUTINE_WORK',
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'INSPECTION',
    'EMERGENCY_WORK',
    'ADMINISTRATIVE_WORK'
  )
  AND f."config" ->> 'collectionMode' = 'CREATION_AND_COMPLETION'
  AND NOT (COALESCE(f."config", '{}'::jsonb) ? 'completionMode');

-- Restore completion Information that the previous UI hid as system-controlled.
-- Only editable drafts are repaired: published/historical versions remain
-- immutable, and explicit draft definitions are never overwritten.
INSERT INTO "work_field_definitions" (
  "id",
  "work_type_version_id",
  "stage_definition_id",
  "code",
  "label",
  "field_type",
  "is_required",
  "sort_order",
  "config",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  v."id",
  NULL,
  'RX_LEVEL_DBM',
  'RX Level (dBm)',
  'DECIMAL'::"WorkFieldType",
  true,
  230,
  '{"min":-100,"max":20,"collectionMode":"COMPLETION_ONLY"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "work_type_versions" v
JOIN "work_type_definitions" d
  ON d."id" = v."work_type_definition_id"
WHERE v."status" = 'DRAFT'
  AND d."code" IN (
    'ROUTINE_WORK',
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'INSPECTION',
    'EMERGENCY_WORK'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "work_field_definitions" existing
    WHERE existing."work_type_version_id" = v."id"
      AND existing."code" = 'RX_LEVEL_DBM'
  );

INSERT INTO "work_field_definitions" (
  "id",
  "work_type_version_id",
  "stage_definition_id",
  "code",
  "label",
  "field_type",
  "is_required",
  "sort_order",
  "config",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  v."id",
  NULL,
  'CUSTOMER_ID',
  'Customer ID',
  'REFERENCE'::"WorkFieldType",
  d."code" <> 'NETWORK_MAINTENANCE',
  240,
  '{"maxLength":100,"collectionMode":"COMPLETION_ONLY"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "work_type_versions" v
JOIN "work_type_definitions" d
  ON d."id" = v."work_type_definition_id"
WHERE v."status" = 'DRAFT'
  AND d."code" IN (
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'EMERGENCY_WORK'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "work_field_definitions" existing
    WHERE existing."work_type_version_id" = v."id"
      AND existing."code" = 'CUSTOMER_ID'
  );

-- Keep the old Work Records reference choice as the default configuration.
-- Do not replace an explicitly configured Report Reference.
UPDATE "work_field_definitions" f
SET "config" = jsonb_set(
  COALESCE(f."config", '{}'::jsonb),
  '{reportReference}',
  'true'::jsonb,
  true
),
"updated_at" = CURRENT_TIMESTAMP
FROM "work_type_versions" v
JOIN "work_type_definitions" d
  ON d."id" = v."work_type_definition_id"
WHERE f."work_type_version_id" = v."id"
  AND NOT EXISTS (
    SELECT 1
    FROM "work_field_definitions" configured
    WHERE configured."work_type_version_id" = v."id"
      AND configured."config" ->> 'reportReference' = 'true'
  )
  AND (
    (d."code" IN ('NEW_INSTALLATION', 'UPDATE_SERVICES') AND f."code" = 'TOKEN_NUMBER')
    OR
    (d."code" IN ('ROUTINE_WORK', 'TROUBLE_TICKET', 'INSPECTION', 'EMERGENCY_WORK') AND f."code" = 'SERVICE_NUMBER')
  );
