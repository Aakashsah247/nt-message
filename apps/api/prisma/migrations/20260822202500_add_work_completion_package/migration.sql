ALTER TABLE "work_completion_reports"
  ADD COLUMN "cpc_serial" VARCHAR(100),
  ADD COLUMN "service_number" VARCHAR(100),
  ADD COLUMN "customer_id" VARCHAR(100),
  ADD COLUMN "rx_level_dbm" DOUBLE PRECISION,
  ADD COLUMN "olt" VARCHAR(100),
  ADD COLUMN "fdc_name" VARCHAR(100),
  ADD COLUMN "fap_name" VARCHAR(100);
