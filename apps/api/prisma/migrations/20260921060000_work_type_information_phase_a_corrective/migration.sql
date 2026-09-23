-- Phase A corrective: complete the editable field contract for all eight
-- permanent Work Types without mutating any PUBLISHED or RETIRED version.
--
-- Some offices already had a published Work Type with no open draft. Phase A
-- intentionally repaired editable drafts only, so those definitions still
-- need a safe next draft before the field model can be considered complete.
-- This migration creates that next draft by cloning the latest published
-- fixed-template configuration, then applies the same completion-field rules.

-- 1) Create one next draft for a permanent Work Type only when it has a
-- published version and no open draft. Existing drafts are never replaced.
WITH permanent_definitions AS (
  SELECT d."id", d."code"
  FROM "work_type_definitions" d
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
),
latest_published AS (
  SELECT DISTINCT ON (v."work_type_definition_id")
    v.*
  FROM "work_type_versions" v
  JOIN permanent_definitions d
    ON d."id" = v."work_type_definition_id"
  WHERE v."status" = 'PUBLISHED'
  ORDER BY v."work_type_definition_id", v."version" DESC
),
missing_drafts AS (
  SELECT
    p.*,
    (
      SELECT MAX(all_versions."version") + 1
      FROM "work_type_versions" all_versions
      WHERE all_versions."work_type_definition_id" = p."work_type_definition_id"
    ) AS next_version
  FROM latest_published p
  WHERE NOT EXISTS (
    SELECT 1
    FROM "work_type_versions" draft
    WHERE draft."work_type_definition_id" = p."work_type_definition_id"
      AND draft."status" = 'DRAFT'
  )
)
INSERT INTO "work_type_versions" (
  "id",
  "work_type_definition_id",
  "version",
  "status",
  "name",
  "description",
  "template",
  "change_reason",
  "primary_owner_org_unit_id",
  "creator_categories",
  "creator_scope",
  "final_closure_mode",
  "final_closure_leadership_type",
  "sla_basis",
  "overall_sla_minutes",
  "created_by_account_id",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  source."work_type_definition_id",
  source.next_version,
  'DRAFT'::"WorkTypeVersionStatus",
  source."name",
  source."description",
  source."template",
  'Phase A corrective draft cloned from the latest published version; published history remains immutable.',
  source."primary_owner_org_unit_id",
  source."creator_categories",
  source."creator_scope",
  source."final_closure_mode",
  source."final_closure_leadership_type",
  source."sla_basis",
  source."overall_sla_minutes",
  COALESCE(source."published_by_account_id", source."created_by_account_id"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM missing_drafts source;

-- 2) Pair each newly/current open draft with the latest published version only
-- when that draft is exactly the next version after the published history.
-- This prevents the migration from copying over pre-existing user drafts.
WITH latest_published AS (
  SELECT DISTINCT ON (v."work_type_definition_id")
    v."id",
    v."work_type_definition_id",
    v."version"
  FROM "work_type_versions" v
  JOIN "work_type_definitions" d
    ON d."id" = v."work_type_definition_id"
  WHERE v."status" = 'PUBLISHED'
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
  ORDER BY v."work_type_definition_id", v."version" DESC
),
created_pairs AS (
  SELECT
    published."id" AS published_id,
    draft."id" AS draft_id
  FROM latest_published published
  JOIN "work_type_versions" draft
    ON draft."work_type_definition_id" = published."work_type_definition_id"
   AND draft."status" = 'DRAFT'
   AND draft."version" = published."version" + 1
   AND draft."change_reason" = 'Phase A corrective draft cloned from the latest published version; published history remains immutable.'
)
INSERT INTO "work_type_creator_org_units" (
  "id",
  "work_type_version_id",
  "org_unit_id",
  "include_descendants",
  "created_at"
)
SELECT
  gen_random_uuid(),
  pair.draft_id,
  owner."org_unit_id",
  owner."include_descendants",
  CURRENT_TIMESTAMP
FROM created_pairs pair
JOIN "work_type_creator_org_units" owner
  ON owner."work_type_version_id" = pair.published_id
WHERE NOT EXISTS (
  SELECT 1
  FROM "work_type_creator_org_units" existing
  WHERE existing."work_type_version_id" = pair.draft_id
    AND existing."org_unit_id" = owner."org_unit_id"
);

WITH latest_published AS (
  SELECT DISTINCT ON (v."work_type_definition_id")
    v."id",
    v."work_type_definition_id",
    v."version"
  FROM "work_type_versions" v
  JOIN "work_type_definitions" d
    ON d."id" = v."work_type_definition_id"
  WHERE v."status" = 'PUBLISHED'
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
  ORDER BY v."work_type_definition_id", v."version" DESC
),
created_pairs AS (
  SELECT
    published."id" AS published_id,
    draft."id" AS draft_id
  FROM latest_published published
  JOIN "work_type_versions" draft
    ON draft."work_type_definition_id" = published."work_type_definition_id"
   AND draft."status" = 'DRAFT'
   AND draft."version" = published."version" + 1
   AND draft."change_reason" = 'Phase A corrective draft cloned from the latest published version; published history remains immutable.'
)
INSERT INTO "work_type_creator_accounts" (
  "id",
  "work_type_version_id",
  "account_id",
  "created_at"
)
SELECT
  gen_random_uuid(),
  pair.draft_id,
  creator."account_id",
  CURRENT_TIMESTAMP
FROM created_pairs pair
JOIN "work_type_creator_accounts" creator
  ON creator."work_type_version_id" = pair.published_id
WHERE NOT EXISTS (
  SELECT 1
  FROM "work_type_creator_accounts" existing
  WHERE existing."work_type_version_id" = pair.draft_id
    AND existing."account_id" = creator."account_id"
);

-- Clone business Information only. Work Result, completion summary and
-- more-work-required remain platform-owned Work Foundation controls.
WITH latest_published AS (
  SELECT DISTINCT ON (v."work_type_definition_id")
    v."id",
    v."work_type_definition_id",
    v."version"
  FROM "work_type_versions" v
  JOIN "work_type_definitions" d
    ON d."id" = v."work_type_definition_id"
  WHERE v."status" = 'PUBLISHED'
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
  ORDER BY v."work_type_definition_id", v."version" DESC
),
created_pairs AS (
  SELECT
    published."id" AS published_id,
    draft."id" AS draft_id
  FROM latest_published published
  JOIN "work_type_versions" draft
    ON draft."work_type_definition_id" = published."work_type_definition_id"
   AND draft."status" = 'DRAFT'
   AND draft."version" = published."version" + 1
   AND draft."change_reason" = 'Phase A corrective draft cloned from the latest published version; published history remains immutable.'
)
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
  pair.draft_id,
  NULL,
  field."code",
  field."label",
  field."field_type",
  field."is_required",
  field."sort_order",
  field."config",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM created_pairs pair
JOIN "work_field_definitions" field
  ON field."work_type_version_id" = pair.published_id
WHERE field."code" NOT IN (
    'COMPLETION_RESULT',
    'COMPLETION_SUMMARY',
    'MORE_WORK_REQUIRED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "work_field_definitions" existing
    WHERE existing."work_type_version_id" = pair.draft_id
      AND existing."code" = field."code"
  );

-- 3) Platform-owned completion controls must not remain editable Information
-- fields in any open draft. Published and retired versions are untouched.
DELETE FROM "work_field_definitions" field
USING "work_type_versions" version_record,
      "work_type_definitions" definition
WHERE field."work_type_version_id" = version_record."id"
  AND version_record."work_type_definition_id" = definition."id"
  AND version_record."status" = 'DRAFT'
  AND definition."code" IN (
    'ROUTINE_WORK',
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'INSPECTION',
    'EMERGENCY_WORK',
    'ADMINISTRATIVE_WORK'
  )
  AND field."code" IN (
    'COMPLETION_RESULT',
    'COMPLETION_SUMMARY',
    'MORE_WORK_REQUIRED'
  );

-- 4) Every operational open draft gets RX Level as Completion-only when it is
-- absent. This repairs newly cloned Network Maintenance (and remains safe for
-- any other permanent operational type with a published-only state).
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
  version_record."id",
  NULL,
  'RX_LEVEL_DBM',
  'RX Level (dBm)',
  'DECIMAL'::"WorkFieldType",
  true,
  230,
  '{"min":-100,"max":20,"collectionMode":"COMPLETION_ONLY"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "work_type_versions" version_record
JOIN "work_type_definitions" definition
  ON definition."id" = version_record."work_type_definition_id"
WHERE version_record."status" = 'DRAFT'
  AND definition."code" IN (
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
    WHERE existing."work_type_version_id" = version_record."id"
      AND existing."code" = 'RX_LEVEL_DBM'
  );

-- Customer ID follows the finalized old model: required for Trouble Ticket,
-- New Installation, Update Services and Emergency; optional for Network
-- Maintenance; absent by default for Routine and Inspection.
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
  version_record."id",
  NULL,
  'CUSTOMER_ID',
  'Customer ID',
  'REFERENCE'::"WorkFieldType",
  definition."code" <> 'NETWORK_MAINTENANCE',
  240,
  '{"maxLength":100,"collectionMode":"COMPLETION_ONLY"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "work_type_versions" version_record
JOIN "work_type_definitions" definition
  ON definition."id" = version_record."work_type_definition_id"
WHERE version_record."status" = 'DRAFT'
  AND definition."code" IN (
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'EMERGENCY_WORK'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "work_field_definitions" existing
    WHERE existing."work_type_version_id" = version_record."id"
      AND existing."code" = 'CUSTOMER_ID'
  );
