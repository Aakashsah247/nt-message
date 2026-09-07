-- Phase 7 / P7-D: Office working calendar foundation for V3 SLA calculation.
-- This is additive. Existing Work due timestamps remain unchanged; calendar
-- changes affect only new SLA due-time calculations after configuration.

CREATE TABLE "office_working_calendars" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kathmandu',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by_account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "office_working_calendars_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "office_working_calendars_timezone_check"
    CHECK ("time_zone" = 'Asia/Kathmandu'),
  CONSTRAINT "office_working_calendars_version_check"
    CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "office_working_calendars_office_id_key"
ON "office_working_calendars"("office_id");

CREATE INDEX "office_working_calendars_active_idx"
ON "office_working_calendars"("is_active");

CREATE INDEX "office_working_calendars_updated_by_at_idx"
ON "office_working_calendars"("updated_by_account_id", "updated_at");

CREATE TABLE "office_working_calendar_intervals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "calendar_id" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "office_working_calendar_intervals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "office_working_calendar_intervals_weekday_check"
    CHECK ("weekday" BETWEEN 1 AND 7),
  CONSTRAINT "office_working_calendar_intervals_start_check"
    CHECK ("start_minute" BETWEEN 0 AND 1439),
  CONSTRAINT "office_working_calendar_intervals_end_check"
    CHECK ("end_minute" BETWEEN 1 AND 1440),
  CONSTRAINT "office_working_calendar_intervals_order_check"
    CHECK ("start_minute" < "end_minute"),
  CONSTRAINT "office_working_calendar_intervals_sort_check"
    CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX "office_working_calendar_intervals_unique"
ON "office_working_calendar_intervals"(
  "calendar_id",
  "weekday",
  "start_minute",
  "end_minute"
);

CREATE INDEX "office_working_calendar_intervals_day_idx"
ON "office_working_calendar_intervals"("calendar_id", "weekday", "start_minute");

CREATE TABLE "office_working_calendar_closures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "calendar_id" UUID NOT NULL,
  "closure_date" DATE NOT NULL,
  "label" VARCHAR(160),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "office_working_calendar_closures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "office_working_calendar_closures_date_key"
ON "office_working_calendar_closures"("calendar_id", "closure_date");

CREATE INDEX "office_working_calendar_closures_date_idx"
ON "office_working_calendar_closures"("calendar_id", "closure_date");

ALTER TABLE "office_working_calendars"
  ADD CONSTRAINT "office_working_calendars_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "office_working_calendars_updated_by_account_id_fkey"
  FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "office_working_calendar_intervals"
  ADD CONSTRAINT "office_working_calendar_intervals_calendar_id_fkey"
  FOREIGN KEY ("calendar_id") REFERENCES "office_working_calendars"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "office_working_calendar_closures"
  ADD CONSTRAINT "office_working_calendar_closures_calendar_id_fkey"
  FOREIGN KEY ("calendar_id") REFERENCES "office_working_calendars"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
