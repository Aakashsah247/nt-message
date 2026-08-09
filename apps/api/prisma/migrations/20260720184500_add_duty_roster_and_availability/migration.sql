-- M20 Phase 5: add duty scheduling, availability and duty-aware help coordination.
-- This migration is additive and does not remove or rewrite existing project records.

ALTER TYPE "MessagingNotificationType" ADD VALUE IF NOT EXISTS 'DUTY';

CREATE TYPE "DutyRecurrenceType" AS ENUM (
  'ONE_TIME',
  'DATE_RANGE',
  'WEEKLY'
);

CREATE TYPE "DutyExceptionType" AS ENUM (
  'LEAVE',
  'HOLIDAY'
);

CREATE TYPE "WorkAvailabilityPreference" AS ENUM (
  'AVAILABLE',
  'BUSY'
);

CREATE TYPE "DutyActivityAction" AS ENUM (
  'ASSIGNED',
  'RESCHEDULED',
  'CANCELLED',
  'EXCEPTION_RECORDED',
  'AVAILABILITY_CHANGED'
);

ALTER TABLE "work_help_requests"
  ADD COLUMN "requested_department_id" UUID,
  ADD COLUMN "coordinated_by_account_id" UUID,
  ADD COLUMN "coordinated_at" TIMESTAMPTZ(3);

CREATE TABLE "duty_shift_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "spans_next_day" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "division_id" UUID,
  "department_id" UUID,
  "created_by_account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "duty_shift_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "duty_shift_templates_minutes_check"
    CHECK (
      "start_minute" >= 0 AND "start_minute" <= 1439 AND
      "end_minute" >= 0 AND "end_minute" <= 1439 AND
      "start_minute" <> "end_minute"
    )
);

CREATE TABLE "duty_schedule_series" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_account_id" UUID NOT NULL,
  "shift_template_id" UUID NOT NULL,
  "supervisor_account_id" UUID NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "division_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "recurrence_type" "DutyRecurrenceType" NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "reporting_location" VARCHAR(300) NOT NULL,
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "duty_schedule_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "duty_schedule_series_date_order_check"
    CHECK ("end_date" >= "start_date")
);

CREATE TABLE "duty_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "series_id" UUID NOT NULL,
  "employee_account_id" UUID NOT NULL,
  "shift_template_id" UUID NOT NULL,
  "supervisor_account_id" UUID NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "division_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "duty_date" DATE NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "reporting_location" VARCHAR(300) NOT NULL,
  "notes" VARCHAR(1000),
  "cancelled_at" TIMESTAMPTZ(3),
  "cancelled_by_account_id" UUID,
  "cancellation_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "duty_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "duty_assignments_window_check" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "duty_exceptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_account_id" UUID NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "division_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "exception_date" DATE NOT NULL,
  "type" "DutyExceptionType" NOT NULL,
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "duty_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_work_availability" (
  "account_id" UUID NOT NULL,
  "preference" "WorkAvailabilityPreference" NOT NULL DEFAULT 'AVAILABLE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "employee_work_availability_pkey" PRIMARY KEY ("account_id")
);

CREATE TABLE "duty_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "duty_assignment_id" UUID,
  "series_id" UUID,
  "employee_account_id" UUID NOT NULL,
  "actor_account_id" UUID NOT NULL,
  "action" "DutyActivityAction" NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "duty_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "duty_shift_templates_scope_name_key"
ON "duty_shift_templates"("name", "division_id", "department_id");

CREATE INDEX "duty_shift_templates_scope_active_idx"
ON "duty_shift_templates"("division_id", "department_id", "is_active");

CREATE INDEX "duty_schedule_series_employee_dates_idx"
ON "duty_schedule_series"("employee_account_id", "start_date", "end_date");

CREATE INDEX "duty_schedule_series_department_dates_idx"
ON "duty_schedule_series"("department_id", "start_date", "end_date");

CREATE UNIQUE INDEX "duty_assignments_employee_window_key"
ON "duty_assignments"("employee_account_id", "starts_at", "ends_at");

CREATE INDEX "duty_assignments_employee_window_idx"
ON "duty_assignments"("employee_account_id", "starts_at", "ends_at");

CREATE INDEX "duty_assignments_department_window_idx"
ON "duty_assignments"("department_id", "starts_at", "ends_at");

CREATE INDEX "duty_assignments_supervisor_start_idx"
ON "duty_assignments"("supervisor_account_id", "starts_at");

CREATE UNIQUE INDEX "duty_exceptions_employee_date_key"
ON "duty_exceptions"("employee_account_id", "exception_date");

CREATE INDEX "duty_exceptions_department_date_idx"
ON "duty_exceptions"("department_id", "exception_date");

CREATE INDEX "employee_work_availability_preference_idx"
ON "employee_work_availability"("preference", "updated_at");

CREATE INDEX "duty_activities_employee_created_idx"
ON "duty_activities"("employee_account_id", "created_at");

CREATE INDEX "duty_activities_assignment_created_idx"
ON "duty_activities"("duty_assignment_id", "created_at");

CREATE INDEX "work_help_requests_department_status_created_idx"
ON "work_help_requests"("requested_department_id", "status", "created_at");

CREATE INDEX "work_help_requests_coordinator_idx"
ON "work_help_requests"("coordinated_by_account_id", "coordinated_at");

ALTER TABLE "work_help_requests"
  ADD CONSTRAINT "work_help_requests_requested_department_id_fkey"
  FOREIGN KEY ("requested_department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_help_requests"
  ADD CONSTRAINT "work_help_requests_coordinated_by_account_id_fkey"
  FOREIGN KEY ("coordinated_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_shift_templates"
  ADD CONSTRAINT "duty_shift_templates_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_shift_templates"
  ADD CONSTRAINT "duty_shift_templates_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_shift_templates"
  ADD CONSTRAINT "duty_shift_templates_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_employee_account_id_fkey"
  FOREIGN KEY ("employee_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_shift_template_id_fkey"
  FOREIGN KEY ("shift_template_id") REFERENCES "duty_shift_templates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_supervisor_account_id_fkey"
  FOREIGN KEY ("supervisor_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "duty_schedule_series"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_employee_account_id_fkey"
  FOREIGN KEY ("employee_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_shift_template_id_fkey"
  FOREIGN KEY ("shift_template_id") REFERENCES "duty_shift_templates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_supervisor_account_id_fkey"
  FOREIGN KEY ("supervisor_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_cancelled_by_account_id_fkey"
  FOREIGN KEY ("cancelled_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_exceptions"
  ADD CONSTRAINT "duty_exceptions_employee_account_id_fkey"
  FOREIGN KEY ("employee_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_exceptions"
  ADD CONSTRAINT "duty_exceptions_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_exceptions"
  ADD CONSTRAINT "duty_exceptions_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_exceptions"
  ADD CONSTRAINT "duty_exceptions_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_work_availability"
  ADD CONSTRAINT "employee_work_availability_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "duty_activities"
  ADD CONSTRAINT "duty_activities_duty_assignment_id_fkey"
  FOREIGN KEY ("duty_assignment_id") REFERENCES "duty_assignments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "duty_activities"
  ADD CONSTRAINT "duty_activities_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "duty_schedule_series"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "duty_activities"
  ADD CONSTRAINT "duty_activities_employee_account_id_fkey"
  FOREIGN KEY ("employee_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_activities"
  ADD CONSTRAINT "duty_activities_actor_account_id_fkey"
  FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
