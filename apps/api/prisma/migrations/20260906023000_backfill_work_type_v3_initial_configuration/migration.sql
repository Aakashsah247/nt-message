-- P5-F3: reconstruct the approved WM-V2 business rules as immutable
-- configuration on the eight Patan Work Type V3 version-1 records.
--
-- This is a one-time compatibility reconstruction. Version 1 was published in
-- P5-C before the normalized configuration schema existed, so this migration
-- fills that historical configuration exactly once. Live WorkItem execution is
-- intentionally unchanged; Phase 6+ owns runtime cutover.
--
-- Primary Owner is derived from the dominant mapped legacy Department for each
-- existing WorkItem type. This avoids guessing a Patan OrgUnit by name. The two
-- existing Sales-involved Work Types use the confirmed active PATAN/SAL OrgUnit
-- as a required parallel participant stage.

DO $$
DECLARE
  patan_office_id UUID;
  sales_org_unit_id UUID;
  target_version_count INTEGER;
  already_configured_count INTEGER;
  resolved_owner_count INTEGER;
  stage_count INTEGER;
  field_count INTEGER;
BEGIN
  SELECT office."id"
  INTO patan_office_id
  FROM "offices" office
  WHERE office."code" = 'PATAN'
    AND office."is_active" = true;

  IF patan_office_id IS NULL THEN
    RAISE EXCEPTION
      'P5-F3 requires the active PATAN Office created by the hierarchy backfill.';
  END IF;

  SELECT unit."id"
  INTO sales_org_unit_id
  FROM "org_units" unit
  WHERE unit."office_id" = patan_office_id
    AND unit."code" = 'SAL'
    AND unit."is_active" = true;

  IF sales_org_unit_id IS NULL THEN
    RAISE EXCEPTION
      'P5-F3 requires the confirmed active PATAN Sales OrgUnit (code SAL) for New Installation and Update Services.';
  END IF;

  SELECT COUNT(*)
  INTO target_version_count
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
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
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  IF target_version_count <> 8 THEN
    RAISE EXCEPTION
      'P5-F3 expected 8 PATAN published version-1 Work Types, found %.',
      target_version_count;
  END IF;

  SELECT COUNT(DISTINCT version_record."id")
  INTO already_configured_count
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED'
    AND (
      version_record."primary_owner_org_unit_id" IS NOT NULL
      OR cardinality(version_record."creator_categories") > 0
      OR EXISTS (
        SELECT 1
        FROM "work_field_definitions" field_definition
        WHERE field_definition."work_type_version_id" = version_record."id"
      )
      OR EXISTS (
        SELECT 1
        FROM "work_stage_definitions" stage_definition
        WHERE stage_definition."work_type_version_id" = version_record."id"
      )
    );

  IF already_configured_count <> 0 THEN
    RAISE EXCEPTION
      'P5-F3 expected the eight P5-C version-1 records to be unconfigured before reconstruction; found % already configured.',
      already_configured_count;
  END IF;

  -- Derive each compatibility Primary Owner from actual legacy Work history:
  -- count mapped legacy Departments by Work type and take the dominant one.
  WITH owner_counts AS (
    SELECT
      version_record."id" AS version_id,
      mapping."org_unit_id" AS org_unit_id,
      COUNT(*) AS work_count
    FROM "work_type_versions" version_record
    JOIN "work_type_definitions" definition
      ON definition."id" = version_record."work_type_definition_id"
    JOIN "work_items" work_item
      ON work_item."type" = definition."legacy_work_item_type"
    JOIN "legacy_org_unit_mappings" mapping
      ON mapping."legacy_entity_type" = 'DEPARTMENT'
     AND mapping."legacy_entity_id" = work_item."department_id"
     AND mapping."office_id" = definition."office_id"
    JOIN "org_units" owner_unit
      ON owner_unit."id" = mapping."org_unit_id"
     AND owner_unit."office_id" = definition."office_id"
     AND owner_unit."is_active" = true
    WHERE definition."office_id" = patan_office_id
      AND version_record."version" = 1
      AND version_record."status" = 'PUBLISHED'
    GROUP BY version_record."id", mapping."org_unit_id"
  ), ranked_owners AS (
    SELECT
      owner_counts.*,
      ROW_NUMBER() OVER (
        PARTITION BY owner_counts.version_id
        ORDER BY owner_counts.work_count DESC, owner_counts.org_unit_id
      ) AS owner_rank
    FROM owner_counts
  )
  UPDATE "work_type_versions" version_record
  SET
    "primary_owner_org_unit_id" = ranked_owners.org_unit_id,
    "creator_categories" = ARRAY[
      'OFFICE_HEAD'::"WorkTypeCreatorCategory",
      'ORG_UNIT_HEAD'::"WorkTypeCreatorCategory",
      'TEAM_LEAD'::"WorkTypeCreatorCategory"
    ],
    "creator_scope" = 'PRIMARY_OWNER_SUBTREE'::"WorkTypeCreatorScope",
    "final_closure_mode" = 'AUTO_AFTER_REQUIRED_STAGES'::"WorkFinalClosureMode",
    "final_closure_leadership_type" = NULL,
    "sla_basis" = 'CALENDAR_DURATION'::"WorkSlaBasis",
    "overall_sla_minutes" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  FROM ranked_owners
  WHERE ranked_owners.owner_rank = 1
    AND version_record."id" = ranked_owners.version_id;

  SELECT COUNT(*)
  INTO resolved_owner_count
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  JOIN "org_units" owner_unit
    ON owner_unit."id" = version_record."primary_owner_org_unit_id"
   AND owner_unit."office_id" = definition."office_id"
   AND owner_unit."is_active" = true
  WHERE definition."office_id" = patan_office_id
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  IF resolved_owner_count <> 8 THEN
    RAISE EXCEPTION
      'P5-F3 could resolve a valid mapped Primary Owner for only % of 8 Work Types.',
      resolved_owner_count;
  END IF;

  -- Existing operational Work remains Team-owned for the initial compatibility
  -- configuration. Administrative Work keeps Team-or-individual semantics by
  -- routing through ORG_UNIT_OR_USER (a TEAM is itself an OrgUnit in V3).
  INSERT INTO "work_stage_definitions" (
    "id",
    "work_type_version_id",
    "code",
    "name",
    "description",
    "sort_order",
    "is_required",
    "responsible_org_unit_rule",
    "responsible_org_unit_id",
    "assignment_mode",
    "approval_mode",
    "approval_leadership_type",
    "activation_mode",
    "activation_field_definition_id",
    "activation_expected_value",
    "sla_minutes",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    version_record."id",
    'EXECUTION',
    CASE
      WHEN definition."code" = 'ADMINISTRATIVE_WORK' THEN 'Administrative work'
      ELSE 'Work execution'
    END,
    CASE
      WHEN definition."code" = 'ADMINISTRATIVE_WORK'
        THEN 'Execute the administrative task under the authorized management chain.'
      ELSE 'Perform the main technical work and submit the required completion information.'
    END,
    10,
    true,
    'PRIMARY_OWNER'::"WorkStageResponsibleOrgUnitRule",
    NULL,
    CASE
      WHEN definition."code" = 'ADMINISTRATIVE_WORK'
        THEN 'ORG_UNIT_OR_USER'::"WorkStageAssignmentMode"
      ELSE 'TEAM'::"WorkStageAssignmentMode"
    END,
    CASE
      WHEN definition."code" = 'ADMINISTRATIVE_WORK'
        THEN 'RESPONSIBLE_ORG_UNIT_HEAD'::"WorkStageApprovalMode"
      ELSE 'TEAM_LEAD'::"WorkStageApprovalMode"
    END,
    NULL,
    'ALWAYS'::"WorkStageActivationMode",
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Sales coordination is a required parallel stage for the two Work Types
  -- that already require a Sales Member. It is now represented as normal
  -- cross-OrgUnit stage configuration rather than a permanent special runtime
  -- architecture. Phase 6+ will instantiate the participant/stage runtime.
  INSERT INTO "work_stage_definitions" (
    "id",
    "work_type_version_id",
    "code",
    "name",
    "description",
    "sort_order",
    "is_required",
    "responsible_org_unit_rule",
    "responsible_org_unit_id",
    "assignment_mode",
    "approval_mode",
    "approval_leadership_type",
    "activation_mode",
    "activation_field_definition_id",
    "activation_expected_value",
    "sla_minutes",
    "created_at",
    "updated_at"
  )
  SELECT
    gen_random_uuid(),
    version_record."id",
    'SALES_COORDINATION',
    'Sales coordination',
    'Complete the required Sales coordination for this Work before final closure.',
    20,
    true,
    'SPECIFIC_ORG_UNIT'::"WorkStageResponsibleOrgUnitRule",
    sales_org_unit_id,
    'INDIVIDUAL'::"WorkStageAssignmentMode",
    'NONE'::"WorkStageApprovalMode",
    NULL,
    'ALWAYS'::"WorkStageActivationMode",
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND definition."code" IN ('NEW_INSTALLATION', 'UPDATE_SERVICES')
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Common operational intake fields. Planned Start, Due, ticket identity,
  -- Office, Work Type/version, Primary Owner and overall status remain fixed
  -- Work runtime fields and are intentionally not duplicated here.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(),
    version_record."id",
    NULL,
    seed.code,
    seed.label,
    seed.field_type::"WorkFieldType",
    seed.is_required,
    seed.sort_order,
    seed.config,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  CROSS JOIN (
    VALUES
      ('CUSTOMER_NAME', 'Customer name', 'TEXT', true, 10, '{"maxLength":160}'::jsonb),
      ('CUSTOMER_CONTACT_TYPE', 'Contact type', 'SELECT', true, 20, '{"options":["MOBILE","TELEPHONE"]}'::jsonb),
      ('CUSTOMER_CONTACT_NUMBER', 'Contact number', 'TEXT', true, 30, '{"maxLength":30}'::jsonb),
      ('LOCATION', 'Location', 'TEXT', true, 40, '{"maxLength":300}'::jsonb),
      ('REGISTERED_AT', 'Registered date and time', 'DATETIME', true, 50, NULL::jsonb),
      ('OLT', 'OLT', 'REFERENCE', true, 60, '{"maxLength":100}'::jsonb),
      ('FDC_NAME', 'FDC name', 'REFERENCE', true, 70, '{"maxLength":100}'::jsonb),
      ('FAP_NAME', 'FAP name', 'REFERENCE', true, 80, '{"maxLength":100}'::jsonb)
  ) AS seed(code, label, field_type, is_required, sort_order, config)
  WHERE definition."office_id" = patan_office_id
    AND definition."code" <> 'ADMINISTRATIVE_WORK'
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Service Number remains required for the existing operational types that
  -- use it. New Installation explicitly does not use Service Number and
  -- Network Maintenance keeps the existing no-required-service-number rule.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(), version_record."id", NULL,
    'SERVICE_NUMBER',
    CASE WHEN definition."code" = 'UPDATE_SERVICES' THEN 'Existing service number' ELSE 'Service number' END,
    'REFERENCE'::"WorkFieldType", true, 90, '{"maxLength":100}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND definition."code" IN (
      'ROUTINE_WORK', 'TROUBLE_TICKET', 'UPDATE_SERVICES', 'INSPECTION', 'EMERGENCY_WORK'
    )
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Token Number applies to New Installation and Update Services. CPC Serial
  -- applies only to New Installation; no Service Number is introduced there.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(), version_record."id", NULL,
    'TOKEN_NUMBER', 'Token number', 'REFERENCE'::"WorkFieldType", true, 90,
    '{"maxLength":100}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND definition."code" IN ('NEW_INSTALLATION', 'UPDATE_SERVICES')
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(), version_record."id", NULL,
    'CPC_SERIAL', 'CPC Serial', 'REFERENCE'::"WorkFieldType", true, 100,
    '{"maxLength":100}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND definition."code" = 'NEW_INSTALLATION'
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Current service selection is required only for Trouble Ticket,
  -- New Installation and Update Services.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(), version_record."id", NULL,
    'SERVICE_TYPES', 'Services', 'MULTI_SELECT'::"WorkFieldType", true, 110,
    '{"options":["DATA","VOICE","IPTV","SIP","OTHER"],"minSelections":1,"maxSelections":5}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND definition."code" IN ('TROUBLE_TICKET', 'NEW_INSTALLATION', 'UPDATE_SERVICES')
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(), version_record."id", NULL,
    'OTHER_SERVICE_TEXT', 'Other service', 'TEXT'::"WorkFieldType", false, 120,
    '{"maxLength":160}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND definition."code" IN ('TROUBLE_TICKET', 'NEW_INSTALLATION', 'UPDATE_SERVICES')
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Common operational completion package: result, summary, RX Level and the
  -- existing more-work flag. RX Level remains required for every operational
  -- type; Administrative Work intentionally has no RX Level.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(),
    version_record."id",
    execution_stage."id",
    seed.code,
    seed.label,
    seed.field_type::"WorkFieldType",
    seed.is_required,
    seed.sort_order,
    seed.config,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  JOIN "work_stage_definitions" execution_stage
    ON execution_stage."work_type_version_id" = version_record."id"
   AND execution_stage."code" = 'EXECUTION'
  CROSS JOIN (
    VALUES
      ('COMPLETION_RESULT', 'Completion result', 'SELECT', true, 200, '{"options":["FULLY_RESOLVED","TEMPORARY_SOLUTION","UNABLE_TO_RESOLVE"]}'::jsonb),
      ('COMPLETION_SUMMARY', 'Completion summary', 'LONG_TEXT', true, 210, '{"maxLength":3000}'::jsonb),
      ('MORE_WORK_REQUIRED', 'More work required', 'BOOLEAN', false, 220, NULL::jsonb),
      ('RX_LEVEL_DBM', 'RX Level (dBm)', 'DECIMAL', true, 230, '{"min":-100,"max":20}'::jsonb)
  ) AS seed(code, label, field_type, is_required, sort_order, config)
  WHERE definition."office_id" = patan_office_id
    AND definition."code" <> 'ADMINISTRATIVE_WORK'
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Customer ID completion rules: required for Trouble Ticket, New
  -- Installation, Update Services and Emergency Work; optional for Network
  -- Maintenance; intentionally absent from Routine Work and Inspection.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(),
    version_record."id",
    execution_stage."id",
    'CUSTOMER_ID',
    'Customer ID',
    'REFERENCE'::"WorkFieldType",
    definition."code" <> 'NETWORK_MAINTENANCE',
    240,
    '{"maxLength":100}'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  JOIN "work_stage_definitions" execution_stage
    ON execution_stage."work_type_version_id" = version_record."id"
   AND execution_stage."code" = 'EXECUTION'
  WHERE definition."office_id" = patan_office_id
    AND definition."code" IN (
      'TROUBLE_TICKET', 'NETWORK_MAINTENANCE', 'NEW_INSTALLATION',
      'UPDATE_SERVICES', 'EMERGENCY_WORK'
    )
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Preserve the optional Sales completion note on the new generalized Sales
  -- coordination stage.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(), version_record."id", sales_stage."id",
    'SALES_NOTE', 'Sales note', 'LONG_TEXT'::"WorkFieldType", false, 200,
    '{"maxLength":1500}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  JOIN "work_stage_definitions" sales_stage
    ON sales_stage."work_type_version_id" = version_record."id"
   AND sales_stage."code" = 'SALES_COORDINATION'
  WHERE definition."office_id" = patan_office_id
    AND definition."code" IN ('NEW_INSTALLATION', 'UPDATE_SERVICES')
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  -- Administrative Work keeps its current non-customer/non-network shape.
  INSERT INTO "work_field_definitions" (
    "id", "work_type_version_id", "stage_definition_id", "code", "label",
    "field_type", "is_required", "sort_order", "config", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(),
    version_record."id",
    CASE WHEN seed.stage_bound THEN execution_stage."id" ELSE NULL END,
    seed.code,
    seed.label,
    seed.field_type::"WorkFieldType",
    seed.is_required,
    seed.sort_order,
    seed.config,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  JOIN "work_stage_definitions" execution_stage
    ON execution_stage."work_type_version_id" = version_record."id"
   AND execution_stage."code" = 'EXECUTION'
  CROSS JOIN (
    VALUES
      ('TASK_TITLE', 'Task title', 'TEXT', true, 10, '{"maxLength":160}'::jsonb, false),
      ('TASK_DESCRIPTION', 'Task description', 'LONG_TEXT', true, 20, '{"maxLength":4000}'::jsonb, false),
      ('COMPLETION_RESULT', 'Completion result', 'SELECT', true, 200, '{"options":["FULLY_RESOLVED","TEMPORARY_SOLUTION","UNABLE_TO_RESOLVE"]}'::jsonb, true),
      ('COMPLETION_SUMMARY', 'Completion summary', 'LONG_TEXT', true, 210, '{"maxLength":3000}'::jsonb, true),
      ('MORE_WORK_REQUIRED', 'More work required', 'BOOLEAN', false, 220, NULL::jsonb, true)
  ) AS seed(code, label, field_type, is_required, sort_order, config, stage_bound)
  WHERE definition."office_id" = patan_office_id
    AND definition."code" = 'ADMINISTRATIVE_WORK'
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  SELECT COUNT(*)
  INTO stage_count
  FROM "work_stage_definitions" stage_definition
  JOIN "work_type_versions" version_record
    ON version_record."id" = stage_definition."work_type_version_id"
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  IF stage_count <> 10 THEN
    RAISE EXCEPTION
      'P5-F3 stage reconciliation failed: expected 10 configuration stages, found %.',
      stage_count;
  END IF;

  SELECT COUNT(*)
  INTO field_count
  FROM "work_field_definitions" field_definition
  JOIN "work_type_versions" version_record
    ON version_record."id" = field_definition."work_type_version_id"
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE definition."office_id" = patan_office_id
    AND version_record."version" = 1
    AND version_record."status" = 'PUBLISHED';

  IF field_count <> 110 THEN
    RAISE EXCEPTION
      'P5-F3 field reconciliation failed: expected 110 configuration fields, found %.',
      field_count;
  END IF;
END $$;
