-- M20 Patch D3: effective-dated planned staffing targets for truthful duty-coverage reporting.
CREATE TYPE "DutyCoverageRequirementAction" AS ENUM (
  'CREATED',
  'UPDATED',
  'RETIRED'
);

CREATE TABLE "duty_coverage_requirements" (
  "id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "shift_template_id" UUID NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "required_staff" INTEGER NOT NULL,
  "reporting_location" VARCHAR(300),
  "reporting_location_key" VARCHAR(300),
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "created_by_account_id" UUID NOT NULL,
  "updated_by_account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "duty_coverage_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "duty_coverage_requirement_activities" (
  "id" UUID NOT NULL,
  "requirement_id" UUID NOT NULL,
  "actor_account_id" UUID NOT NULL,
  "action" "DutyCoverageRequirementAction" NOT NULL,
  "previous_state" JSONB,
  "next_state" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "duty_coverage_requirement_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "duty_coverage_requirements_department_dates_idx"
ON "duty_coverage_requirements"("department_id", "effective_from", "effective_until");

CREATE INDEX "duty_coverage_requirements_shift_day_idx"
ON "duty_coverage_requirements"("shift_template_id", "day_of_week", "effective_from");

CREATE INDEX "duty_coverage_requirements_location_dates_idx"
ON "duty_coverage_requirements"("reporting_location_key", "effective_from");

CREATE INDEX "duty_coverage_requirement_activities_requirement_idx"
ON "duty_coverage_requirement_activities"("requirement_id", "created_at");

CREATE INDEX "duty_coverage_requirement_activities_actor_idx"
ON "duty_coverage_requirement_activities"("actor_account_id", "created_at");

ALTER TABLE "duty_coverage_requirements"
  ADD CONSTRAINT "duty_coverage_requirements_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_coverage_requirements_shift_template_id_fkey"
    FOREIGN KEY ("shift_template_id") REFERENCES "duty_shift_templates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_coverage_requirements_created_by_account_id_fkey"
    FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_coverage_requirements_updated_by_account_id_fkey"
    FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_coverage_requirements_day_check"
    CHECK ("day_of_week" BETWEEN 0 AND 6),
  ADD CONSTRAINT "duty_coverage_requirements_staff_check"
    CHECK ("required_staff" BETWEEN 1 AND 500),
  ADD CONSTRAINT "duty_coverage_requirements_dates_check"
    CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  ADD CONSTRAINT "duty_coverage_requirements_location_check"
    CHECK (
      ("reporting_location" IS NULL AND "reporting_location_key" IS NULL)
      OR
      ("reporting_location" IS NOT NULL AND "reporting_location_key" IS NOT NULL)
    );

ALTER TABLE "duty_coverage_requirement_activities"
  ADD CONSTRAINT "duty_coverage_requirement_activities_requirement_id_fkey"
    FOREIGN KEY ("requirement_id") REFERENCES "duty_coverage_requirements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_coverage_requirement_activities_actor_account_id_fkey"
    FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Serialize writes for one department/shift/weekday slot, then reject overlapping generic or location-specific targets.
CREATE OR REPLACE FUNCTION "enforce_duty_coverage_requirement_overlap"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW."department_id"::text || ':' || NEW."shift_template_id"::text || ':' || NEW."day_of_week"::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM "duty_coverage_requirements" existing
    WHERE existing."id" <> NEW."id"
      AND existing."department_id" = NEW."department_id"
      AND existing."shift_template_id" = NEW."shift_template_id"
      AND existing."day_of_week" = NEW."day_of_week"
      AND (
        existing."reporting_location_key" IS NULL
        OR NEW."reporting_location_key" IS NULL
        OR existing."reporting_location_key" = NEW."reporting_location_key"
      )
      AND daterange(
        existing."effective_from",
        COALESCE(existing."effective_until", 'infinity'::date),
        '[]'
      ) && daterange(
        NEW."effective_from",
        COALESCE(NEW."effective_until", 'infinity'::date),
        '[]'
      )
  ) THEN
    RAISE EXCEPTION 'overlapping duty coverage requirement'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "duty_coverage_requirements_overlap_guard"
BEFORE INSERT OR UPDATE ON "duty_coverage_requirements"
FOR EACH ROW EXECUTE FUNCTION "enforce_duty_coverage_requirement_overlap"();
