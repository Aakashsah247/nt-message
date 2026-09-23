CREATE TABLE "work_report_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "dataset" VARCHAR(40) NOT NULL,
  "period_from" VARCHAR(10),
  "period_to" VARCHAR(10),
  "query" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_report_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_report_snapshots_office_created_idx"
  ON "work_report_snapshots"("office_id", "created_at");
CREATE INDEX "work_report_snapshots_creator_created_idx"
  ON "work_report_snapshots"("created_by_account_id", "created_at");

ALTER TABLE "work_report_snapshots"
  ADD CONSTRAINT "work_report_snapshots_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_report_snapshots"
  ADD CONSTRAINT "work_report_snapshots_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
