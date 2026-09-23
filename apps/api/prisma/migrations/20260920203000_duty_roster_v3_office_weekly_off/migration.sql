-- Scope weekly-off configuration by Office while preserving the previous global setting for every existing Office.
ALTER TABLE "duty_weekly_off_settings" ADD COLUMN "office_id" UUID;

CREATE TEMP TABLE "duty_weekly_off_settings_v3_seed" AS
SELECT
  office."id" AS "office_id",
  weekly."day_of_week",
  weekly."updated_by_account_id",
  weekly."created_at",
  weekly."updated_at"
FROM "offices" AS office
CROSS JOIN "duty_weekly_off_settings" AS weekly;

DELETE FROM "duty_weekly_off_settings";

ALTER TABLE "duty_weekly_off_settings" DROP CONSTRAINT "duty_weekly_off_settings_pkey";

INSERT INTO "duty_weekly_off_settings"
  ("office_id", "day_of_week", "updated_by_account_id", "created_at", "updated_at")
SELECT "office_id", "day_of_week", "updated_by_account_id", "created_at", "updated_at"
FROM "duty_weekly_off_settings_v3_seed";

DROP TABLE "duty_weekly_off_settings_v3_seed";

ALTER TABLE "duty_weekly_off_settings" ALTER COLUMN "office_id" SET NOT NULL;
ALTER TABLE "duty_weekly_off_settings"
  ADD CONSTRAINT "duty_weekly_off_settings_pkey" PRIMARY KEY ("office_id", "day_of_week");
ALTER TABLE "duty_weekly_off_settings"
  ADD CONSTRAINT "duty_weekly_off_settings_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "duty_weekly_off_settings_office_day_idx"
  ON "duty_weekly_off_settings"("office_id", "day_of_week");
