-- Allow explicitly selected Supporting Staff to contribute to a Work execution
-- stage from another OrgUnit in the same Office without weakening PRIMARY stage
-- ownership constraints.
--
-- PRIMARY assignments still have to match the stage assignment mode and remain
-- inside the responsible OrgUnit scope. SUPPORTING assignments are account-only
-- and may come from any effective Office membership. This is the intended V3
-- cross-organization support model: the stage remains owned by its responsible
-- OrgUnit while the helper's OrgUnit is recorded on the Work as a supporting
-- participant.
--
-- This also brings the trigger in line with the Operational Team cutover by
-- validating canonical target_operational_team_id rows, not only the historical
-- target_org_unit_id compatibility shape.

BEGIN;

CREATE OR REPLACE FUNCTION "enforce_work_stage_assignment_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_item_id UUID;
  work_office_id UUID;
  responsible_org_unit_id UUID;
  assignment_mode "WorkStageAssignmentMode";
  target_office_id UUID;
  target_is_team BOOLEAN;
  target_team_org_unit_id UUID;
  target_employee_id UUID;
BEGIN
  SELECT work_item."id", work_item."office_id", stage."responsible_org_unit_id", stage."assignment_mode"
    INTO work_item_id, work_office_id, responsible_org_unit_id, assignment_mode
  FROM "work_stages" stage
  JOIN "work_items" work_item ON work_item."id" = stage."work_item_id"
  WHERE stage."id" = NEW."work_stage_id";

  IF NEW."assignment_role" = 'PRIMARY' THEN
    IF assignment_mode = 'ORG_UNIT_QUEUE' AND NEW."target_type" <> 'ORG_UNIT_QUEUE' THEN
      RAISE EXCEPTION
        'ORG_UNIT_QUEUE stage must use an OrgUnit queue assignment target.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
    ELSIF assignment_mode = 'TEAM' AND NEW."target_type" <> 'TEAM' THEN
      RAISE EXCEPTION
        'TEAM stage must use a Team assignment target.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
    ELSIF assignment_mode = 'TEAM_OR_USER'
          AND NEW."target_type" NOT IN ('TEAM', 'ACCOUNT') THEN
      RAISE EXCEPTION
        'TEAM_OR_USER stage must use a Team or account assignment target.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
    ELSIF assignment_mode = 'INDIVIDUAL' AND NEW."target_type" <> 'ACCOUNT' THEN
      RAISE EXCEPTION
        'INDIVIDUAL stage must use an account assignment target.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
    ELSIF assignment_mode = 'ORG_UNIT_OR_TEAM'
          AND NEW."target_type" NOT IN ('ORG_UNIT_QUEUE', 'TEAM') THEN
      RAISE EXCEPTION
        'ORG_UNIT_OR_TEAM stage must use an OrgUnit queue or Team assignment target.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
    ELSIF assignment_mode = 'ORG_UNIT_OR_USER'
          AND NEW."target_type" NOT IN ('ORG_UNIT_QUEUE', 'ACCOUNT') THEN
      RAISE EXCEPTION
        'ORG_UNIT_OR_USER stage must use an OrgUnit queue or account assignment target.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
    ELSIF assignment_mode = 'RESPONSIBLE_ORG_UNIT_HEAD' AND NEW."target_type" <> 'ACCOUNT' THEN
      RAISE EXCEPTION
        'RESPONSIBLE_ORG_UNIT_HEAD stage must resolve to an account assignment target.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
    END IF;
  ELSIF NEW."assignment_role" = 'SUPPORTING' AND NEW."target_type" <> 'ACCOUNT' THEN
    RAISE EXCEPTION
      'Supporting stage assignments must target an individual account.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_supporting_target_check';
  END IF;

  IF NEW."target_org_unit_id" IS NOT NULL THEN
    SELECT unit."office_id", unit_type."is_team"
      INTO target_office_id, target_is_team
    FROM "org_units" unit
    JOIN "org_unit_types" unit_type ON unit_type."id" = unit."org_unit_type_id"
    WHERE unit."id" = NEW."target_org_unit_id";

    IF FOUND AND target_office_id <> work_office_id THEN
      RAISE EXCEPTION
        'Stage assignment OrgUnit must belong to the Work Office.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_target_unit_same_office_check';
    END IF;

    IF NEW."target_type" = 'ORG_UNIT_QUEUE'
       AND NEW."target_org_unit_id" <> responsible_org_unit_id THEN
      RAISE EXCEPTION
        'OrgUnit queue assignment must target the responsible OrgUnit.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_queue_responsible_unit_check';
    END IF;

    -- Retained compatibility validation for historical TEAM rows that still
    -- identify the old Team OrgUnit target instead of an Operational Team row.
    IF NEW."target_type" = 'TEAM' AND NEW."target_operational_team_id" IS NULL THEN
      IF FOUND AND NOT target_is_team THEN
        RAISE EXCEPTION
          'TEAM stage assignment must target a Team OrgUnit.'
          USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_team_target_check';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM "org_unit_closure" closure
        WHERE closure."ancestor_org_unit_id" = responsible_org_unit_id
          AND closure."descendant_org_unit_id" = NEW."target_org_unit_id"
      ) AND NEW."target_org_unit_id" <> responsible_org_unit_id THEN
        RAISE EXCEPTION
          'Team assignment must target a Team inside the responsible OrgUnit subtree.'
          USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_team_responsible_scope_check';
      END IF;
    END IF;
  END IF;

  IF NEW."target_type" = 'TEAM' AND NEW."target_operational_team_id" IS NOT NULL THEN
    SELECT team."org_unit_id"
      INTO target_team_org_unit_id
    FROM "operational_teams" team
    JOIN "org_units" unit ON unit."id" = team."org_unit_id"
    WHERE team."id" = NEW."target_operational_team_id"
      AND team."is_active" = TRUE
      AND team."archived_at" IS NULL
      AND unit."office_id" = work_office_id
      AND unit."is_active" = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'TEAM stage assignment must target an active Operational Team in the Work Office.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_operational_team_active_check';
    END IF;

    IF target_team_org_unit_id <> responsible_org_unit_id
       AND NOT EXISTS (
         SELECT 1
         FROM "org_unit_closure" closure
         WHERE closure."ancestor_org_unit_id" = responsible_org_unit_id
           AND closure."descendant_org_unit_id" = target_team_org_unit_id
       ) THEN
      RAISE EXCEPTION
        'Operational Team assignment must stay inside the responsible OrgUnit scope.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_operational_team_scope_check';
    END IF;
  END IF;

  IF NEW."target_account_id" IS NOT NULL THEN
    SELECT account."employee_id"
      INTO target_employee_id
    FROM "accounts" account
    WHERE account."id" = NEW."target_account_id";

    IF NEW."assignment_role" = 'SUPPORTING' THEN
      IF target_employee_id IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM "org_memberships" membership
           WHERE membership."employee_id" = target_employee_id
             AND membership."office_id" = work_office_id
             AND membership."starts_at" <= NEW."starts_at"
             AND (membership."ends_at" IS NULL OR membership."ends_at" > NEW."starts_at")
             AND EXISTS (
               SELECT 1
               FROM "work_org_unit_participants" participant
               WHERE participant."work_item_id" = work_item_id
                 AND participant."ended_at" IS NULL
                 AND (
                   participant."org_unit_id" = membership."org_unit_id"
                   OR EXISTS (
                     SELECT 1
                     FROM "org_unit_closure" participant_scope
                     WHERE participant_scope."ancestor_org_unit_id" = participant."org_unit_id"
                       AND participant_scope."descendant_org_unit_id" = membership."org_unit_id"
                   )
                 )
             )
         ) THEN
        RAISE EXCEPTION
          'Supporting stage assignment account must have an effective membership in an active Work participant organization.'
          USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_supporting_account_office_check';
      END IF;
    ELSIF target_employee_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM "org_memberships" membership
         WHERE membership."employee_id" = target_employee_id
           AND membership."office_id" = work_office_id
           AND membership."starts_at" <= NEW."starts_at"
           AND (membership."ends_at" IS NULL OR membership."ends_at" > NEW."starts_at")
           AND (
             membership."org_unit_id" = responsible_org_unit_id
             OR EXISTS (
               SELECT 1
               FROM "org_unit_closure" closure
               WHERE closure."ancestor_org_unit_id" = responsible_org_unit_id
                 AND closure."descendant_org_unit_id" = membership."org_unit_id"
             )
           )
       ) THEN
      RAISE EXCEPTION
        'Stage assignment account must have an effective membership inside the responsible OrgUnit scope.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_target_account_responsible_scope_check';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
