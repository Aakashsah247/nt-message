-- Phase 11 P11-4: preserve Operational Team context on Duty history and new lifecycle writes.
ALTER TABLE "duty_schedule_series"
  ADD COLUMN "operational_team_id" UUID;

ALTER TABLE "duty_assignments"
  ADD COLUMN "operational_team_id" UUID;

-- Recover explicit Team context already captured by P11-3 activity snapshots where available.
WITH latest_assignment_team AS (
  SELECT DISTINCT ON (activity."duty_assignment_id")
    activity."duty_assignment_id",
    team."id" AS "operational_team_id"
  FROM "duty_activities" activity
  JOIN "operational_teams" team
    ON team."id"::text = activity."details" ->> 'operationalTeamId'
  WHERE activity."duty_assignment_id" IS NOT NULL
    AND activity."details" ->> 'operationalTeamId' IS NOT NULL
  ORDER BY activity."duty_assignment_id", activity."created_at" DESC
)
UPDATE "duty_assignments" assignment
SET "operational_team_id" = latest."operational_team_id"
FROM latest_assignment_team latest
WHERE assignment."id" = latest."duty_assignment_id";

-- A series receives a Team only when every recovered Team-tagged assignment agrees on one Team.
WITH series_team AS (
  SELECT
    assignment."series_id",
    MIN(assignment."operational_team_id"::text)::uuid AS "operational_team_id"
  FROM "duty_assignments" assignment
  WHERE assignment."operational_team_id" IS NOT NULL
  GROUP BY assignment."series_id"
  HAVING COUNT(DISTINCT assignment."operational_team_id") = 1
)
UPDATE "duty_schedule_series" series
SET "operational_team_id" = series_team."operational_team_id"
FROM series_team
WHERE series."id" = series_team."series_id";

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_operational_team_id_fkey"
  FOREIGN KEY ("operational_team_id") REFERENCES "operational_teams"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_operational_team_id_fkey"
  FOREIGN KEY ("operational_team_id") REFERENCES "operational_teams"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "duty_schedule_series_operational_team_dates_idx"
  ON "duty_schedule_series"("operational_team_id", "start_date", "end_date");

CREATE INDEX "duty_assignments_operational_team_window_idx"
  ON "duty_assignments"("operational_team_id", "starts_at", "ends_at");
