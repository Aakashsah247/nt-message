-- Phase 13 / Checkpoint 18: full legacy-data reconciliation before model/schema retirement.
--
-- This migration is intentionally non-destructive. It makes legacy organization,
-- Duty, account-request and communication rows redundant by ensuring a complete
-- Office/OrgUnit/Operational-Team V3 projection. Legacy columns/tables remain in
-- place for rollback until the later destructive cleanup checkpoint.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Reassert the permanent legacy -> V3 hierarchy mapping is complete.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "divisions" d
    LEFT JOIN "legacy_org_unit_mappings" m
      ON m."legacy_entity_type" = 'DIVISION'
     AND m."legacy_entity_id" = d."id"
    LEFT JOIN "org_units" ou
      ON ou."id" = m."org_unit_id"
     AND ou."office_id" = m."office_id"
    WHERE m."id" IS NULL OR ou."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: an legacy Division has no valid V3 OrgUnit mapping.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "departments" d
    LEFT JOIN "legacy_org_unit_mappings" m
      ON m."legacy_entity_type" = 'DEPARTMENT'
     AND m."legacy_entity_id" = d."id"
    LEFT JOIN "org_units" ou
      ON ou."id" = m."org_unit_id"
     AND ou."office_id" = m."office_id"
    WHERE m."id" IS NULL OR ou."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: a legacy Department has no valid V3 OrgUnit mapping.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams" t
    LEFT JOIN "legacy_org_unit_mappings" m
      ON m."legacy_entity_type" = 'TEAM'
     AND m."legacy_entity_id" = t."id"
    LEFT JOIN "org_units" ou
      ON ou."id" = m."org_unit_id"
     AND ou."office_id" = m."office_id"
    WHERE m."id" IS NULL OR ou."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: a legacy Team has no valid V3 OrgUnit mapping.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Fill any residual employee primary-membership gaps from audited mappings.
--    Existing V3 membership history always wins; this only repairs a missing
--    projection and never overwrites a current V3 placement.
-- ---------------------------------------------------------------------------

INSERT INTO "org_memberships" (
  "id",
  "employee_id",
  "office_id",
  "org_unit_id",
  "membership_type",
  "assignment_source",
  "starts_at",
  "ends_at",
  "assigned_by_account_id",
  "ended_by_account_id",
  "assignment_reason",
  "end_reason",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  e."id",
  COALESCE(department_map."office_id", division_map."office_id"),
  COALESCE(department_map."org_unit_id", division_map."org_unit_id"),
  'PRIMARY'::"OrgMembershipType",
  'LEGACY_MIGRATION'::"OrgAssignmentSource",
  e."created_at",
  CASE
    WHEN e."status" = 'ACTIVE'
      AND e."employment_status" = 'ACTIVE'
      AND e."archived_at" IS NULL
    THEN NULL
    ELSE GREATEST(
      COALESCE(e."employment_ended_at", e."archived_at", e."updated_at", CURRENT_TIMESTAMP),
      e."created_at" + INTERVAL '1 millisecond'
    )
  END,
  NULL,
  NULL,
  'Phase 13 final reconciliation from legacy employee placement.',
  CASE
    WHEN e."status" = 'ACTIVE'
      AND e."employment_status" = 'ACTIVE'
      AND e."archived_at" IS NULL
    THEN NULL
    ELSE LEFT(
      COALESCE(
        NULLIF(BTRIM(e."employment_end_reason"), ''),
        'Legacy employee placement ended before final reconciliation.'
      ),
      500
    )
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "employees" e
LEFT JOIN "legacy_org_unit_mappings" department_map
  ON department_map."legacy_entity_type" = 'DEPARTMENT'
 AND department_map."legacy_entity_id" = e."department_id"
LEFT JOIN "legacy_org_unit_mappings" division_map
  ON division_map."legacy_entity_type" = 'DIVISION'
 AND division_map."legacy_entity_id" = e."division_id"
WHERE COALESCE(department_map."org_unit_id", division_map."org_unit_id") IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "org_memberships" existing
    WHERE existing."employee_id" = e."id"
      AND existing."membership_type" = 'PRIMARY'
  );

-- ---------------------------------------------------------------------------
-- 3. Reconcile Account Requests to Office + intended OrgUnit.
-- ---------------------------------------------------------------------------

UPDATE "account_requests" request
SET
  "office_id" = mapping."office_id",
  "intended_org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = request."department_id"
  AND (
    request."office_id" IS NULL
    OR request."intended_org_unit_id" IS NULL
  );

UPDATE "account_requests" request
SET
  "office_id" = mapping."office_id",
  "intended_org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = request."division_id"
  AND (
    request."office_id" IS NULL
    OR request."intended_org_unit_id" IS NULL
  );

-- ---------------------------------------------------------------------------
-- 4. Reconcile all legacy-scoped Duty records to Office + OrgUnit.
--    Legacy ids are preserved for rollback and are removed only in checkpoint 20.
-- ---------------------------------------------------------------------------

UPDATE "duty_shift_templates" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = row."department_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_shift_templates" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = row."division_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_schedule_series" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = row."department_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_schedule_series" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = row."division_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_assignments" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = row."department_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_assignments" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = row."division_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_coverage_requirements" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = row."department_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_exceptions" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = row."department_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_exceptions" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = row."division_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_holidays" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = row."department_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

UPDATE "duty_holidays" row
SET "office_id" = mapping."office_id",
    "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" mapping
WHERE mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = row."division_id"
  AND (row."office_id" IS NULL OR row."org_unit_id" IS NULL);

-- Duty assignment rows should agree with their canonical series after all
-- series scopes have been reconciled.
UPDATE "duty_assignments" assignment
SET
  "office_id" = series."office_id",
  "org_unit_id" = series."org_unit_id",
  "operational_team_id" = COALESCE(assignment."operational_team_id", series."operational_team_id")
FROM "duty_schedule_series" series
WHERE series."id" = assignment."series_id"
  AND (
    assignment."office_id" IS DISTINCT FROM series."office_id"
    OR assignment."org_unit_id" IS DISTINCT FROM series."org_unit_id"
    OR (
      assignment."operational_team_id" IS NULL
      AND series."operational_team_id" IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Convert historical communication scope values to native V3 scope values.
--    This is the key data cutover that lets checkpoint 20 remove the old
--    Division/Department columns without making old groups/announcements vanish.
-- ---------------------------------------------------------------------------

UPDATE "conversations" conversation
SET
  "official_scope_type" = 'ORG_UNIT'::"OfficialGroupScopeType",
  "official_office_id" = mapping."office_id",
  "official_org_unit_id" = mapping."org_unit_id",
  "official_membership_mode" = COALESCE(
    conversation."official_membership_mode",
    'ENTIRE_SUBTREE'::"OfficialGroupMembershipMode"
  ),
  "official_division_id" = NULL,
  "official_department_id" = NULL
FROM "legacy_org_unit_mappings" mapping
WHERE conversation."group_kind" = 'OFFICIAL'
  AND conversation."official_scope_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = conversation."official_department_id";

UPDATE "conversations" conversation
SET
  "official_scope_type" = 'ORG_UNIT'::"OfficialGroupScopeType",
  "official_office_id" = mapping."office_id",
  "official_org_unit_id" = mapping."org_unit_id",
  "official_membership_mode" = COALESCE(
    conversation."official_membership_mode",
    'ENTIRE_SUBTREE'::"OfficialGroupMembershipMode"
  ),
  "official_division_id" = NULL,
  "official_department_id" = NULL
FROM "legacy_org_unit_mappings" mapping
WHERE conversation."group_kind" = 'OFFICIAL'
  AND conversation."official_scope_type" = 'DIVISION'
  AND mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = conversation."official_division_id";

UPDATE "conversations" conversation
SET
  "official_scope_type" = 'OFFICE'::"OfficialGroupScopeType",
  "official_office_id" = single_office."id",
  "official_org_unit_id" = NULL,
  "official_membership_mode" = COALESCE(
    conversation."official_membership_mode",
    'ENTIRE_SUBTREE'::"OfficialGroupMembershipMode"
  ),
  "official_division_id" = NULL,
  "official_department_id" = NULL
FROM (
  SELECT office."id"
  FROM "offices" office
  WHERE (SELECT COUNT(*) FROM "offices") = 1
) single_office
WHERE conversation."group_kind" = 'OFFICIAL'
  AND conversation."official_scope_type" = 'ORGANIZATION';

UPDATE "announcements" announcement
SET
  "audience_type" = 'ORG_UNIT'::"AnnouncementAudienceType",
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id",
  "include_descendants" = TRUE,
  "division_id" = NULL,
  "department_id" = NULL
FROM "legacy_org_unit_mappings" mapping
WHERE announcement."audience_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = announcement."department_id";

UPDATE "announcements" announcement
SET
  "audience_type" = 'ORG_UNIT'::"AnnouncementAudienceType",
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id",
  "include_descendants" = TRUE,
  "division_id" = NULL,
  "department_id" = NULL
FROM "legacy_org_unit_mappings" mapping
WHERE announcement."audience_type" = 'DIVISION'
  AND mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = announcement."division_id";

UPDATE "announcements" announcement
SET
  "audience_type" = 'OFFICE'::"AnnouncementAudienceType",
  "office_id" = single_office."id",
  "org_unit_id" = NULL,
  "include_descendants" = FALSE,
  "division_id" = NULL,
  "department_id" = NULL
FROM (
  SELECT office."id"
  FROM "offices" office
  WHERE (SELECT COUNT(*) FROM "offices") = 1
) single_office
WHERE announcement."audience_type" = 'ORGANIZATION';

-- Preserve useful V3 context on historical official-group announcements.
UPDATE "announcements" announcement
SET
  "office_id" = conversation."official_office_id",
  "org_unit_id" = conversation."official_org_unit_id"
FROM "conversations" conversation
WHERE announcement."audience_type" = 'OFFICIAL_GROUP'
  AND announcement."official_conversation_id" = conversation."id"
  AND conversation."group_kind" = 'OFFICIAL'
  AND conversation."official_office_id" IS NOT NULL
  AND (
    announcement."office_id" IS DISTINCT FROM conversation."official_office_id"
    OR announcement."org_unit_id" IS DISTINCT FROM conversation."official_org_unit_id"
  );

-- ---------------------------------------------------------------------------
-- 6. Final fail-closed reconciliation gates.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "employees" e
    WHERE NOT EXISTS (
      SELECT 1
      FROM "org_memberships" m
      WHERE m."employee_id" = e."id"
        AND m."membership_type" = 'PRIMARY'
    )
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: employee without V3 primary membership history.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "employees" e
    WHERE e."status" = 'ACTIVE'
      AND e."employment_status" = 'ACTIVE'
      AND e."archived_at" IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "org_memberships" m
        WHERE m."employee_id" = e."id"
          AND m."membership_type" = 'PRIMARY'
          AND m."ends_at" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: active employee without active V3 primary membership.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams" legacy_team
    LEFT JOIN "operational_teams" team
      ON team."legacy_department_team_id" = legacy_team."id"
    WHERE team."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: legacy Team without Operational Team projection.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_team_members" legacy_member
    JOIN "operational_teams" team
      ON team."legacy_department_team_id" = legacy_member."team_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "operational_team_members" member
      WHERE member."team_id" = team."id"
        AND member."employee_id" = legacy_member."employee_id"
    )
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: legacy Team member without Operational Team history.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" work_item
    WHERE work_item."office_id" IS NULL
       OR work_item."work_type_version_id" IS NULL
       OR work_item."primary_owner_org_unit_id" IS NULL
       OR work_item."runtime_status" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: Work row without complete V3 runtime context.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "account_requests" request
    WHERE request."status" <> 'REJECTED'
      AND (
        request."office_id" IS NULL
        OR request."intended_org_unit_id" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: active account request without V3 scope.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "duty_shift_templates"
    WHERE "office_id" IS NULL OR "org_unit_id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "duty_schedule_series"
    WHERE "office_id" IS NULL OR "org_unit_id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "duty_assignments"
    WHERE "office_id" IS NULL OR "org_unit_id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "duty_coverage_requirements"
    WHERE "office_id" IS NULL OR "org_unit_id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "duty_exceptions"
    WHERE "office_id" IS NULL OR "org_unit_id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "duty_holidays"
    WHERE "office_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: Duty data still contains unreconciled V3 scope.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "conversations"
    WHERE "group_kind" = 'OFFICIAL'
      AND "official_scope_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: legacy Official Group scope value remains.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "conversations"
    WHERE "group_kind" = 'OFFICIAL'
      AND (
        "official_office_id" IS NULL
        OR "official_membership_mode" IS NULL
        OR (
          "official_scope_type" = 'ORG_UNIT'
          AND "official_org_unit_id" IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: Official Group lacks native V3 scope.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "announcements"
    WHERE "audience_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: legacy Announcement audience value remains.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "announcements"
    WHERE "audience_type" IN ('OFFICE', 'ORG_UNIT')
      AND (
        "office_id" IS NULL
        OR ("audience_type" = 'ORG_UNIT' AND "org_unit_id" IS NULL)
      )
  ) THEN
    RAISE EXCEPTION 'Phase 13 reconciliation failed: Announcement lacks native V3 scope.';
  END IF;
END
$$;

COMMIT;
