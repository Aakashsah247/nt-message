-- New Installation and Update Services select the Sales organization/member at
-- Work creation time. The responsible Sales OrgUnit is therefore runtime data,
-- not a fixed Work Type owner. Normalize every existing Work Type version so
-- older published definitions cannot route the Sales account back through the
-- Technical/Main-Team OrgUnit and trip stage-assignment membership integrity.
--
-- Existing runtime Work is safe: work_stages already snapshots its own
-- responsible_org_unit_id, so this only affects future Work creation.

BEGIN;

UPDATE "work_stage_definitions" AS stage
SET
  "responsible_org_unit_rule" = 'RUNTIME_REQUESTED_PARTICIPANT',
  "responsible_org_unit_id" = NULL
FROM "work_type_versions" AS version,
     "work_type_definitions" AS definition
WHERE stage."work_type_version_id" = version."id"
  AND version."work_type_definition_id" = definition."id"
  AND stage."code" = 'SALES_COORDINATION'
  AND definition."code" IN ('NEW_INSTALLATION', 'UPDATE_SERVICES')
  AND (
    stage."responsible_org_unit_rule" <> 'RUNTIME_REQUESTED_PARTICIPANT'
    OR stage."responsible_org_unit_id" IS NOT NULL
  );

COMMIT;
