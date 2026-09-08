-- TS-C: Separate formal OrgUnit responsibility from operational Team execution.
--
-- Corrected business model:
--   * Work Primary Owner is a formal OrgUnit.
--   * Work participants and stage responsibility are formal OrgUnits.
--   * Team is an operational execution grouping under a formal OrgUnit.
--
-- Compatibility:
--   * legacy Team OrgUnits and LegacyOrgUnitMapping rows remain untouched;
--   * target_org_unit_id remains populated for TEAM assignments until the
--     runtime write/read cutover in TS-E;
--   * this migration adds the canonical OperationalTeam target and corrects
--     current Work/participant/stage responsibility without deleting history.

BEGIN;

ALTER TABLE "work_stage_assignments"
  ADD COLUMN "target_operational_team_id" UUID;

CREATE INDEX "work_stage_assignments_target_operational_team_active_idx"
ON "work_stage_assignments"("target_operational_team_id", "ends_at");

ALTER TABLE "work_stage_assignments"
  ADD CONSTRAINT "work_stage_assignments_target_operational_team_id_fkey"
  FOREIGN KEY ("target_operational_team_id")
  REFERENCES "operational_teams"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE TEMP TABLE "tsc_team_unit_map" ON COMMIT DROP AS
SELECT
  mapping."org_unit_id" AS legacy_team_org_unit_id,
  mapping."office_id" AS office_id,
  operational_team."id" AS operational_team_id,
  operational_team."org_unit_id" AS formal_org_unit_id,
  operational_team."legacy_department_team_id" AS legacy_department_team_id
FROM "legacy_org_unit_mappings" AS mapping
JOIN "operational_teams" AS operational_team
  ON operational_team."legacy_department_team_id" = mapping."legacy_entity_id"
JOIN "org_units" AS formal_unit
  ON formal_unit."id" = operational_team."org_unit_id"
JOIN "org_unit_types" AS formal_type
  ON formal_type."id" = formal_unit."org_unit_type_id"
WHERE mapping."legacy_entity_type" = 'TEAM'
  AND formal_type."is_team" = FALSE;

CREATE UNIQUE INDEX "tsc_team_unit_map_legacy_unit_key"
ON "tsc_team_unit_map"("legacy_team_org_unit_id");

CREATE UNIQUE INDEX "tsc_team_unit_map_operational_team_key"
ON "tsc_team_unit_map"("operational_team_id");

CREATE TEMP TABLE "tsc_before_counts" ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM "work_items") AS work_count,
  (SELECT COUNT(*) FROM "work_org_unit_participants") AS participant_count,
  (SELECT COUNT(*) FROM "work_stages") AS stage_count,
  (SELECT COUNT(*) FROM "work_stage_assignments") AS assignment_count,
  (
    SELECT COUNT(*)
    FROM "work_stage_assignments"
    WHERE "target_type" = 'TEAM'
  ) AS team_assignment_count;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "tsc_team_unit_map"
  ) <> (
    SELECT COUNT(*)
    FROM "operational_teams"
    WHERE "legacy_department_team_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'TS-C Team mapping is incomplete; every legacy-backed Operational Team must resolve from its legacy Team OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_type_versions" AS version_record
    JOIN "org_units" AS owner
      ON owner."id" = version_record."primary_owner_org_unit_id"
    JOIN "org_unit_types" AS owner_type
      ON owner_type."id" = owner."org_unit_type_id"
    WHERE owner_type."is_team" = TRUE
  ) THEN
    RAISE EXCEPTION
      'TS-C found a Work Type Version whose Primary Owner is still a Team OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" AS work_item
    JOIN "org_units" AS owner
      ON owner."id" = work_item."primary_owner_org_unit_id"
    JOIN "org_unit_types" AS owner_type
      ON owner_type."id" = owner."org_unit_type_id"
    LEFT JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = work_item."primary_owner_org_unit_id"
    WHERE owner_type."is_team" = TRUE
      AND team_map."operational_team_id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'TS-C cannot resolve at least one Work Team Primary Owner to an Operational Team/formal OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" AS participant
    JOIN "org_units" AS unit
      ON unit."id" = participant."org_unit_id"
    JOIN "org_unit_types" AS unit_type
      ON unit_type."id" = unit."org_unit_type_id"
    WHERE unit_type."is_team" = TRUE
      AND participant."role" <> 'PRIMARY_OWNER'
  ) THEN
    RAISE EXCEPTION
      'TS-C found a non-PRIMARY_OWNER participant stored as a Team OrgUnit; review before migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" AS work_item
    JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = work_item."primary_owner_org_unit_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "work_org_unit_participants" AS participant
      WHERE participant."work_item_id" = work_item."id"
        AND participant."org_unit_id" = work_item."primary_owner_org_unit_id"
        AND participant."role" = 'PRIMARY_OWNER'
        AND participant."ended_at" IS NULL
    )
  ) THEN
    RAISE EXCEPTION
      'TS-C found a Team-owned Work without its active PRIMARY_OWNER participant.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" AS participant
    JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = participant."org_unit_id"
    JOIN "work_items" AS work_item
      ON work_item."id" = participant."work_item_id"
    WHERE participant."role" = 'PRIMARY_OWNER'
      AND work_item."primary_owner_org_unit_id" <> participant."org_unit_id"
  ) THEN
    RAISE EXCEPTION
      'TS-C found Team PRIMARY_OWNER participant history that does not match the Work current Primary Owner.';
  END IF;

  -- A Team-owned Work may already have the formal parent OrgUnit projected as
  -- SUPPORTING_PARTICIPANT by the legacy compatibility migration. That row is
  -- redundant once the formal OrgUnit becomes Primary Owner. It is safe to end
  -- only when it is unreferenced collaboration history. Any other active role
  -- remains ambiguous and must stop the migration.
  IF EXISTS (
    SELECT 1
    FROM "work_items" AS work_item
    JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = work_item."primary_owner_org_unit_id"
    JOIN "work_org_unit_participants" AS existing
      ON existing."work_item_id" = work_item."id"
     AND existing."org_unit_id" = team_map."formal_org_unit_id"
     AND existing."ended_at" IS NULL
    WHERE existing."role" <> 'SUPPORTING_PARTICIPANT'
  ) THEN
    RAISE EXCEPTION
      'TS-C found an active formal-parent participant with a role other than SUPPORTING_PARTICIPANT.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" AS work_item
    JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = work_item."primary_owner_org_unit_id"
    JOIN "work_org_unit_participants" AS existing
      ON existing."work_item_id" = work_item."id"
     AND existing."org_unit_id" = team_map."formal_org_unit_id"
     AND existing."ended_at" IS NULL
     AND existing."role" = 'SUPPORTING_PARTICIPANT'
    JOIN "work_collaboration_requests" AS collaboration
      ON collaboration."participant_id" = existing."id"
  ) THEN
    RAISE EXCEPTION
      'TS-C found a formal-parent SUPPORTING_PARTICIPANT linked to collaboration history; manual reconciliation is required.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stages" AS stage
    JOIN "org_units" AS responsible
      ON responsible."id" = stage."responsible_org_unit_id"
    JOIN "org_unit_types" AS responsible_type
      ON responsible_type."id" = responsible."org_unit_type_id"
    LEFT JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = stage."responsible_org_unit_id"
    WHERE responsible_type."is_team" = TRUE
      AND team_map."operational_team_id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'TS-C cannot resolve at least one Team stage responsibility to its formal OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stages" AS stage
    JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = stage."responsible_org_unit_id"
    JOIN "work_items" AS work_item
      ON work_item."id" = stage."work_item_id"
    WHERE NOT (
      work_item."primary_owner_org_unit_id" = team_map."legacy_team_org_unit_id"
      OR EXISTS (
        SELECT 1
        FROM "work_org_unit_participants" AS participant
        WHERE participant."work_item_id" = stage."work_item_id"
          AND participant."org_unit_id" = team_map."formal_org_unit_id"
          AND participant."ended_at" IS NULL
          AND participant."role" <> 'OBSERVER'
      )
    )
  ) THEN
    RAISE EXCEPTION
      'TS-C cannot move a Team stage to its formal OrgUnit because no effective participant responsibility would exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_assignments" AS assignment
    LEFT JOIN "tsc_team_unit_map" AS team_map
      ON team_map."legacy_team_org_unit_id" = assignment."target_org_unit_id"
    WHERE assignment."target_type" = 'TEAM'
      AND team_map."operational_team_id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'TS-C cannot resolve at least one TEAM assignment to an Operational Team.';
  END IF;
END
$$;

-- The legacy compatibility projection placed the formal parent OrgUnit beside
-- the Team owner as SUPPORTING_PARTICIPANT. Once the formal OrgUnit becomes the
-- Primary Owner that support row would be a duplicate responsibility record.
-- End it rather than delete it so the compatibility history remains visible.
UPDATE "work_org_unit_participants" AS participant
SET
  "ended_at" = CURRENT_TIMESTAMP,
  "end_reason" = 'Ended by TS-C Team separation because this formal OrgUnit becomes the Work Primary Owner.',
  "updated_at" = CURRENT_TIMESTAMP
FROM "work_items" AS work_item,
     "tsc_team_unit_map" AS team_map
WHERE work_item."id" = participant."work_item_id"
  AND work_item."primary_owner_org_unit_id" = team_map."legacy_team_org_unit_id"
  AND participant."org_unit_id" = team_map."formal_org_unit_id"
  AND participant."role" = 'SUPPORTING_PARTICIPANT'
  AND participant."ended_at" IS NULL;

-- Correct the current Work ownership projection first. The WorkItem integrity
-- trigger verifies that the target formal OrgUnit remains in the same Office.
UPDATE "work_items" AS work_item
SET "primary_owner_org_unit_id" = team_map."formal_org_unit_id"
FROM "tsc_team_unit_map" AS team_map
WHERE work_item."primary_owner_org_unit_id" = team_map."legacy_team_org_unit_id";

-- PRIMARY_OWNER participants follow the corrected Work owner. No rows are
-- deleted and the proven original start timestamp / actor remain intact. This
-- fixes the old compatibility projection in place while legacy Team execution
-- evidence remains available through assigned_team_id, mapping rows and the
-- TEAM assignment compatibility pointer.
UPDATE "work_org_unit_participants" AS participant
SET
  "org_unit_id" = team_map."formal_org_unit_id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "tsc_team_unit_map" AS team_map
WHERE participant."org_unit_id" = team_map."legacy_team_org_unit_id"
  AND participant."role" = 'PRIMARY_OWNER'
  AND participant."ended_at" IS NULL;

-- Stage responsibility is formal organizational responsibility. The stage
-- trigger now finds the corrected active participant above.
UPDATE "work_stages" AS stage
SET "responsible_org_unit_id" = team_map."formal_org_unit_id"
FROM "tsc_team_unit_map" AS team_map
WHERE stage."responsible_org_unit_id" = team_map."legacy_team_org_unit_id";

-- Backfill the canonical operational Team identity for every existing TEAM
-- assignment. Keep target_org_unit_id temporarily as a compatibility pointer
-- for the current TS-C runtime code; TS-E will switch new writes/reads.
UPDATE "work_stage_assignments" AS assignment
SET "target_operational_team_id" = team_map."operational_team_id"
FROM "tsc_team_unit_map" AS team_map
WHERE assignment."target_type" = 'TEAM'
  AND assignment."target_org_unit_id" = team_map."legacy_team_org_unit_id";

DO $$
DECLARE
  before_counts RECORD;
BEGIN
  SELECT * INTO before_counts FROM "tsc_before_counts";

  IF (SELECT COUNT(*) FROM "work_items") <> before_counts.work_count THEN
    RAISE EXCEPTION 'TS-C unexpectedly changed the Work row count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_org_unit_participants") <> before_counts.participant_count THEN
    RAISE EXCEPTION 'TS-C unexpectedly changed the Work participant row count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_stages") <> before_counts.stage_count THEN
    RAISE EXCEPTION 'TS-C unexpectedly changed the Work stage row count.';
  END IF;

  IF (SELECT COUNT(*) FROM "work_stage_assignments") <> before_counts.assignment_count THEN
    RAISE EXCEPTION 'TS-C unexpectedly changed the Work stage assignment row count.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_stage_assignments"
    WHERE "target_type" = 'TEAM'
  ) <> before_counts.team_assignment_count THEN
    RAISE EXCEPTION 'TS-C unexpectedly changed the TEAM assignment row count.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" AS work_item
    JOIN "org_units" AS owner
      ON owner."id" = work_item."primary_owner_org_unit_id"
    JOIN "org_unit_types" AS owner_type
      ON owner_type."id" = owner."org_unit_type_id"
    WHERE owner_type."is_team" = TRUE
  ) THEN
    RAISE EXCEPTION 'TS-C left a Work Primary Owner on a Team OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" AS participant
    JOIN "org_units" AS unit
      ON unit."id" = participant."org_unit_id"
    JOIN "org_unit_types" AS unit_type
      ON unit_type."id" = unit."org_unit_type_id"
    WHERE unit_type."is_team" = TRUE
  ) THEN
    RAISE EXCEPTION 'TS-C left a Work participant on a Team OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stages" AS stage
    JOIN "org_units" AS responsible
      ON responsible."id" = stage."responsible_org_unit_id"
    JOIN "org_unit_types" AS responsible_type
      ON responsible_type."id" = responsible."org_unit_type_id"
    WHERE responsible_type."is_team" = TRUE
  ) THEN
    RAISE EXCEPTION 'TS-C left stage responsibility on a Team OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_items" AS work_item
    JOIN "work_org_unit_participants" AS owner_participant
      ON owner_participant."work_item_id" = work_item."id"
     AND owner_participant."org_unit_id" = work_item."primary_owner_org_unit_id"
     AND owner_participant."role" = 'PRIMARY_OWNER'
     AND owner_participant."ended_at" IS NULL
    JOIN "work_org_unit_participants" AS duplicate_support
      ON duplicate_support."work_item_id" = work_item."id"
     AND duplicate_support."org_unit_id" = work_item."primary_owner_org_unit_id"
     AND duplicate_support."role" = 'SUPPORTING_PARTICIPANT'
     AND duplicate_support."ended_at" IS NULL
  ) THEN
    RAISE EXCEPTION
      'TS-C left an active SUPPORTING_PARTICIPANT beside the corrected formal PRIMARY_OWNER.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_assignments" AS assignment
    JOIN "operational_teams" AS operational_team
      ON operational_team."id" = assignment."target_operational_team_id"
    JOIN "work_stages" AS stage
      ON stage."id" = assignment."work_stage_id"
    WHERE assignment."target_type" = 'TEAM'
      AND NOT EXISTS (
        SELECT 1
        FROM "org_unit_closure" AS closure
        WHERE closure."ancestor_org_unit_id" = stage."responsible_org_unit_id"
          AND closure."descendant_org_unit_id" = operational_team."org_unit_id"
      )
  ) THEN
    RAISE EXCEPTION
      'TS-C produced a Team assignment outside the responsible formal OrgUnit scope.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "work_stage_assignments"
    WHERE "target_type" = 'TEAM'
      AND "target_operational_team_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'TS-C left a TEAM assignment without its Operational Team target.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "work_stage_assignments"
    WHERE "target_type" = 'TEAM'
      AND "target_operational_team_id" IS NOT NULL
  ) <> before_counts.team_assignment_count THEN
    RAISE EXCEPTION
      'TS-C Operational Team assignment reconciliation does not match the pre-migration TEAM assignment count.';
  END IF;
END
$$;

COMMIT;
