-- Phase 12 P12-A: additive Office/OrgUnit communication scope foundation.
-- Legacy Division/Department communication columns and enum values remain for compatibility
-- until the Phase 12 runtime cutover is validated and Phase 13 removes obsolete paths.

ALTER TYPE "OfficialGroupScopeType" ADD VALUE IF NOT EXISTS 'OFFICE';
ALTER TYPE "OfficialGroupScopeType" ADD VALUE IF NOT EXISTS 'ORG_UNIT';

CREATE TYPE "OfficialGroupMembershipMode" AS ENUM (
  'DIRECT_MEMBERS',
  'ENTIRE_SUBTREE'
);

ALTER TYPE "AnnouncementAudienceType" ADD VALUE IF NOT EXISTS 'OFFICE';
ALTER TYPE "AnnouncementAudienceType" ADD VALUE IF NOT EXISTS 'ORG_UNIT';

ALTER TABLE "conversations"
  ADD COLUMN "official_office_id" UUID,
  ADD COLUMN "official_org_unit_id" UUID,
  ADD COLUMN "official_membership_mode" "OfficialGroupMembershipMode";

ALTER TABLE "announcements"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "org_unit_id" UUID,
  ADD COLUMN "include_descendants" BOOLEAN NOT NULL DEFAULT false;

-- Existing Division-scoped official groups represented the full Division population,
-- so map them to the audited OrgUnit and preserve that behavior as ENTIRE_SUBTREE.
UPDATE "conversations" AS conversation
SET
  "official_office_id" = mapping."office_id",
  "official_org_unit_id" = mapping."org_unit_id",
  "official_membership_mode" = 'ENTIRE_SUBTREE'
FROM "legacy_org_unit_mappings" AS mapping
WHERE conversation."group_kind" = 'OFFICIAL'
  AND conversation."official_scope_type" = 'DIVISION'
  AND conversation."official_division_id" IS NOT NULL
  AND mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = conversation."official_division_id";

-- Existing Department-scoped official groups likewise included the Department population,
-- including legacy teams below it, so they migrate to ENTIRE_SUBTREE.
UPDATE "conversations" AS conversation
SET
  "official_office_id" = mapping."office_id",
  "official_org_unit_id" = mapping."org_unit_id",
  "official_membership_mode" = 'ENTIRE_SUBTREE'
FROM "legacy_org_unit_mappings" AS mapping
WHERE conversation."group_kind" = 'OFFICIAL'
  AND conversation."official_scope_type" = 'DEPARTMENT'
  AND conversation."official_department_id" IS NOT NULL
  AND mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = conversation."official_department_id";

-- A legacy ORGANIZATION official group is branch-wide. The old deployment has no
-- Office foreign key, so assign it automatically only when this installation contains
-- exactly one Office. Multi-office ambiguity is intentionally left for reconciliation.
WITH single_office AS (
  SELECT "id" AS "office_id"
  FROM "offices"
  WHERE (SELECT COUNT(*) FROM "offices") = 1
  LIMIT 1
)
UPDATE "conversations" AS conversation
SET
  "official_office_id" = single_office."office_id",
  "official_membership_mode" = 'ENTIRE_SUBTREE'
FROM single_office
WHERE conversation."group_kind" = 'OFFICIAL'
  AND conversation."official_scope_type" = 'ORGANIZATION'
  AND conversation."official_office_id" IS NULL;

-- Backfill legacy Division/Department announcements through the same audited mappings.
UPDATE "announcements" AS announcement
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id",
  "include_descendants" = true
FROM "legacy_org_unit_mappings" AS mapping
WHERE announcement."audience_type" = 'DIVISION'
  AND announcement."division_id" IS NOT NULL
  AND mapping."legacy_entity_type" = 'DIVISION'
  AND mapping."legacy_entity_id" = announcement."division_id";

UPDATE "announcements" AS announcement
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id",
  "include_descendants" = true
FROM "legacy_org_unit_mappings" AS mapping
WHERE announcement."audience_type" = 'DEPARTMENT'
  AND announcement."department_id" IS NOT NULL
  AND mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = announcement."department_id";

-- Branch-wide legacy announcements follow the same single-Office safety rule.
WITH single_office AS (
  SELECT "id" AS "office_id"
  FROM "offices"
  WHERE (SELECT COUNT(*) FROM "offices") = 1
  LIMIT 1
)
UPDATE "announcements" AS announcement
SET
  "office_id" = single_office."office_id",
  "include_descendants" = true
FROM single_office
WHERE announcement."audience_type" = 'ORGANIZATION'
  AND announcement."office_id" IS NULL;

-- Official-group announcements inherit the V3 Office/OrgUnit location of their group.
-- Their recipient set remains governed by the group itself, so include_descendants stays false.
UPDATE "announcements" AS announcement
SET
  "office_id" = conversation."official_office_id",
  "org_unit_id" = conversation."official_org_unit_id"
FROM "conversations" AS conversation
WHERE announcement."audience_type" = 'OFFICIAL_GROUP'
  AND announcement."official_conversation_id" = conversation."id"
  AND conversation."group_kind" = 'OFFICIAL'
  AND announcement."office_id" IS NULL;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_official_office_id_fkey"
  FOREIGN KEY ("official_office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "conversations_official_org_unit_id_fkey"
  FOREIGN KEY ("official_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "announcements_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "conversations_official_v3_scope_idx"
  ON "conversations"("official_office_id", "official_org_unit_id", "official_membership_mode");

CREATE INDEX "announcements_v3_audience_scope_idx"
  ON "announcements"("office_id", "org_unit_id", "audience_type", "include_descendants");

-- Replace the legacy-only group target constraint with a compatibility constraint that
-- accepts both historical scope values and the new Office/OrgUnit values.
ALTER TABLE "conversations"
  DROP CONSTRAINT "conversations_official_scope_check";

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_official_scope_check"
  CHECK (
    (
      "group_kind" IS DISTINCT FROM 'OFFICIAL'
      AND "official_scope_type" IS NULL
      AND "official_division_id" IS NULL
      AND "official_department_id" IS NULL
      AND "official_office_id" IS NULL
      AND "official_org_unit_id" IS NULL
      AND "official_membership_mode" IS NULL
    )
    OR
    (
      "group_kind" = 'OFFICIAL'
      AND (
        (
          "official_scope_type" = 'ORGANIZATION'
          AND "official_division_id" IS NULL
          AND "official_department_id" IS NULL
        )
        OR
        (
          "official_scope_type" = 'DIVISION'
          AND "official_division_id" IS NOT NULL
          AND "official_department_id" IS NULL
        )
        OR
        (
          "official_scope_type" = 'DEPARTMENT'
          AND "official_division_id" IS NOT NULL
          AND "official_department_id" IS NOT NULL
        )
        OR
        (
          "official_scope_type" = 'OFFICE'
          AND "official_division_id" IS NULL
          AND "official_department_id" IS NULL
          AND "official_office_id" IS NOT NULL
          AND "official_org_unit_id" IS NULL
          AND "official_membership_mode" IS NOT NULL
        )
        OR
        (
          "official_scope_type" = 'ORG_UNIT'
          AND "official_division_id" IS NULL
          AND "official_department_id" IS NULL
          AND "official_office_id" IS NOT NULL
          AND "official_org_unit_id" IS NOT NULL
          AND "official_membership_mode" IS NOT NULL
        )
      )
      AND ("official_org_unit_id" IS NULL OR "official_office_id" IS NOT NULL)
    )
  );

-- Replace the legacy-only announcement target constraint so the new V3 audience values
-- can be written during the runtime cutover while old rows remain valid and readable.
ALTER TABLE "announcements"
  DROP CONSTRAINT "announcements_audience_target_check";

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_audience_target_check"
  CHECK (
    (
      "audience_type" = 'ORGANIZATION'
      AND "division_id" IS NULL
      AND "department_id" IS NULL
      AND "official_conversation_id" IS NULL
    )
    OR
    (
      "audience_type" = 'DIVISION'
      AND "division_id" IS NOT NULL
      AND "department_id" IS NULL
      AND "official_conversation_id" IS NULL
    )
    OR
    (
      "audience_type" = 'DEPARTMENT'
      AND "division_id" IS NOT NULL
      AND "department_id" IS NOT NULL
      AND "official_conversation_id" IS NULL
    )
    OR
    (
      "audience_type" = 'OFFICIAL_GROUP'
      AND "division_id" IS NULL
      AND "department_id" IS NULL
      AND "official_conversation_id" IS NOT NULL
    )
    OR
    (
      "audience_type" = 'OFFICE'
      AND "division_id" IS NULL
      AND "department_id" IS NULL
      AND "official_conversation_id" IS NULL
      AND "office_id" IS NOT NULL
      AND "org_unit_id" IS NULL
    )
    OR
    (
      "audience_type" = 'ORG_UNIT'
      AND "division_id" IS NULL
      AND "department_id" IS NULL
      AND "official_conversation_id" IS NULL
      AND "office_id" IS NOT NULL
      AND "org_unit_id" IS NOT NULL
    )
  );

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_v3_scope_check"
  CHECK ("org_unit_id" IS NULL OR "office_id" IS NOT NULL);
