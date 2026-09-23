-- Reconcile the Phase 15 temporary "Placement Pending" primary membership
-- for employees who are already active permanent Org Unit Heads.
--
-- When one employee has more than one current permanent head assignment, the
-- most recently effective assignment is used for primary placement. Older
-- leadership records are preserved as history/current governance records and
-- are not silently ended by this data repair.
WITH latest_head AS (
  SELECT DISTINCT ON (ola.employee_id)
    ola.employee_id,
    ola.office_id,
    ola.org_unit_id AS target_org_unit_id,
    ola.assigned_by_account_id,
    ola.effective_from,
    ola.created_at
  FROM org_leadership_assignments ola
  WHERE ola.leadership_type = 'ORG_UNIT_HEAD'
    AND ola.is_acting = false
    AND ola.org_unit_id IS NOT NULL
    AND ola.effective_from <= NOW()
    AND (ola.effective_until IS NULL OR ola.effective_until > NOW())
  ORDER BY
    ola.employee_id,
    ola.effective_from DESC,
    ola.created_at DESC,
    ola.id DESC
),
pending_primary AS (
  SELECT
    om.id AS membership_id,
    om.employee_id,
    om.office_id,
    lh.target_org_unit_id,
    lh.assigned_by_account_id
  FROM org_memberships om
  JOIN org_units current_unit
    ON current_unit.id = om.org_unit_id
  JOIN org_unit_types current_type
    ON current_type.id = current_unit.org_unit_type_id
  JOIN latest_head lh
    ON lh.employee_id = om.employee_id
   AND lh.office_id = om.office_id
  WHERE om.membership_type = 'PRIMARY'
    AND om.starts_at <= NOW()
    AND (om.ends_at IS NULL OR om.ends_at > NOW())
    AND om.org_unit_id IS DISTINCT FROM lh.target_org_unit_id
    AND (
      current_unit.code = 'UNASSIGNED'
      OR current_type.code = 'PLACEMENT_PENDING'
    )
),
ended_pending AS (
  UPDATE org_memberships om
  SET
    ends_at = NOW(),
    ended_by_account_id = pp.assigned_by_account_id,
    end_reason = 'V3 reconciliation: permanent Org Unit Head moved from Placement Pending',
    updated_at = NOW()
  FROM pending_primary pp
  WHERE om.id = pp.membership_id
  RETURNING
    pp.employee_id,
    pp.office_id,
    pp.target_org_unit_id,
    pp.assigned_by_account_id
)
INSERT INTO org_memberships (
  id,
  employee_id,
  office_id,
  org_unit_id,
  membership_type,
  assignment_source,
  starts_at,
  ends_at,
  assigned_by_account_id,
  ended_by_account_id,
  assignment_reason,
  end_reason,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  ep.employee_id,
  ep.office_id,
  ep.target_org_unit_id,
  'PRIMARY',
  'TRANSFER',
  NOW(),
  NULL,
  ep.assigned_by_account_id,
  NULL,
  'V3 reconciliation: align Placement Pending employee with permanent Org Unit Head scope',
  NULL,
  NOW(),
  NOW()
FROM ended_pending ep
WHERE NOT EXISTS (
  SELECT 1
  FROM org_memberships existing
  WHERE existing.employee_id = ep.employee_id
    AND existing.office_id = ep.office_id
    AND existing.membership_type = 'PRIMARY'
    AND existing.org_unit_id = ep.target_org_unit_id
    AND existing.starts_at <= NOW()
    AND (existing.ends_at IS NULL OR existing.ends_at > NOW())
);
