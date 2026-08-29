CREATE TYPE "DutyHolidayType" AS ENUM ('GOVERNMENT', 'FESTIVAL', 'ORGANIZATION', 'OTHER');

CREATE TABLE "duty_holidays" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" "DutyHolidayType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "division_id" UUID,
    "department_id" UUID,
    "note" VARCHAR(1000),
    "created_by_account_id" UUID NOT NULL,
    "updated_by_account_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "duty_holidays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "duty_weekly_off_settings" (
    "day_of_week" INTEGER NOT NULL,
    "updated_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "duty_weekly_off_settings_pkey" PRIMARY KEY ("day_of_week")
);

CREATE INDEX "duty_holidays_dates_cancelled_idx" ON "duty_holidays"("start_date", "end_date", "cancelled_at");
CREATE INDEX "duty_holidays_division_dates_idx" ON "duty_holidays"("division_id", "start_date", "end_date");
CREATE INDEX "duty_holidays_department_dates_idx" ON "duty_holidays"("department_id", "start_date", "end_date");

ALTER TABLE "duty_holidays" ADD CONSTRAINT "duty_holidays_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "duty_holidays" ADD CONSTRAINT "duty_holidays_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "duty_holidays" ADD CONSTRAINT "duty_holidays_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "duty_holidays" ADD CONSTRAINT "duty_holidays_updated_by_account_id_fkey" FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "duty_holidays" ADD CONSTRAINT "duty_holidays_cancelled_by_account_id_fkey" FOREIGN KEY ("cancelled_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "duty_weekly_off_settings" ADD CONSTRAINT "duty_weekly_off_settings_updated_by_account_id_fkey" FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_holidays" ADD CONSTRAINT "duty_holidays_dates_check" CHECK ("end_date" >= "start_date");
ALTER TABLE "duty_holidays" ADD CONSTRAINT "duty_holidays_scope_check" CHECK (
  NOT ("department_id" IS NOT NULL AND "division_id" IS NULL)
);
ALTER TABLE "duty_weekly_off_settings" ADD CONSTRAINT "duty_weekly_off_settings_day_check" CHECK ("day_of_week" BETWEEN 0 AND 6);
