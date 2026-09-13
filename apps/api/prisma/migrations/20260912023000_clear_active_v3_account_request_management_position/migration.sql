-- Phase 13 runtime cutover cleanup
-- Active V3 account requests must no longer depend on legacy ManagementPosition.
-- Preserve the former relation in the latest request action metadata before
-- clearing the compatibility foreign key.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "account_requests" ar
    WHERE ar."management_position_id" IS NOT NULL
      AND ar."office_id" IS NOT NULL
      AND ar."intended_org_unit_id" IS NOT NULL
      AND ar."status" <> 'REJECTED'
      AND NOT EXISTS (
        SELECT 1
        FROM "account_request_actions" ara
        WHERE ara."account_request_id" = ar."id"
      )
  ) THEN
    RAISE EXCEPTION
      'Phase 13 cutover aborted: an active V3 account request with a legacy management position has no audit action to preserve the previous value.';
  END IF;
END $$;

WITH affected AS (
  SELECT
    ar."id" AS request_id,
    ar."management_position_id" AS legacy_management_position_id
  FROM "account_requests" ar
  WHERE ar."management_position_id" IS NOT NULL
    AND ar."office_id" IS NOT NULL
    AND ar."intended_org_unit_id" IS NOT NULL
    AND ar."status" <> 'REJECTED'
),
latest_actions AS (
  SELECT DISTINCT ON (ara."account_request_id")
    ara."id" AS action_id,
    ara."account_request_id" AS request_id
  FROM "account_request_actions" ara
  INNER JOIN affected a
    ON a.request_id = ara."account_request_id"
  ORDER BY ara."account_request_id", ara."created_at" DESC, ara."id" DESC
)
UPDATE "account_request_actions" ara
SET "metadata" = COALESCE(ara."metadata", '{}'::jsonb)
  || jsonb_build_object(
    'phase13LegacyManagementPositionId', a.legacy_management_position_id::text,
    'phase13LegacyManagementPositionCleared', true,
    'phase13CutoverMigration', '20260912023000_clear_active_v3_account_request_management_position'
  )
FROM latest_actions la
INNER JOIN affected a
  ON a.request_id = la.request_id
WHERE ara."id" = la.action_id;

UPDATE "account_requests"
SET "management_position_id" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "management_position_id" IS NOT NULL
  AND "office_id" IS NOT NULL
  AND "intended_org_unit_id" IS NOT NULL
  AND "status" <> 'REJECTED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "account_requests" ar
    WHERE ar."management_position_id" IS NOT NULL
      AND ar."office_id" IS NOT NULL
      AND ar."intended_org_unit_id" IS NOT NULL
      AND ar."status" <> 'REJECTED'
  ) THEN
    RAISE EXCEPTION
      'Phase 13 cutover failed: active V3 account requests still reference legacy management positions.';
  END IF;
END $$;
