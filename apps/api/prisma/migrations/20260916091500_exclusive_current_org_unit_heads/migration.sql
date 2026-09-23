-- Permanent Org Unit Head is an exclusive current hierarchy responsibility
-- for one employee within one Office. Preserve older assignments as history,
-- but end duplicate open/current records at the start of the most recent one.
WITH ranked_current_heads AS (
  SELECT
    ola.id,
    ola.employee_id,
    ola.office_id,
    ola.assigned_by_account_id,
    ola.effective_from,
    ola.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY ola.employee_id, ola.office_id
      ORDER BY ola.effective_from DESC, ola.created_at DESC, ola.id DESC
    ) AS head_rank,
    FIRST_VALUE(ola.effective_from) OVER (
      PARTITION BY ola.employee_id, ola.office_id
      ORDER BY ola.effective_from DESC, ola.created_at DESC, ola.id DESC
    ) AS latest_effective_from,
    FIRST_VALUE(ola.assigned_by_account_id) OVER (
      PARTITION BY ola.employee_id, ola.office_id
      ORDER BY ola.effective_from DESC, ola.created_at DESC, ola.id DESC
    ) AS latest_assigned_by_account_id
  FROM org_leadership_assignments ola
  WHERE ola.leadership_type = 'ORG_UNIT_HEAD'
    AND ola.is_acting = false
    AND ola.org_unit_id IS NOT NULL
    AND ola.effective_from <= NOW()
    AND (ola.effective_until IS NULL OR ola.effective_until > NOW())
), duplicate_current_heads AS (
  SELECT
    id,
    latest_effective_from,
    latest_assigned_by_account_id
  FROM ranked_current_heads
  WHERE head_rank > 1
)
UPDATE org_leadership_assignments ola
SET
  effective_until = dch.latest_effective_from,
  ended_by_account_id = COALESCE(
    ola.ended_by_account_id,
    dch.latest_assigned_by_account_id
  ),
  end_reason = COALESCE(
    ola.end_reason,
    'V3 reconciliation: superseded by newer permanent Org Unit Head assignment'
  ),
  updated_at = NOW()
FROM duplicate_current_heads dch
WHERE ola.id = dch.id
  AND ola.effective_from <= dch.latest_effective_from;
