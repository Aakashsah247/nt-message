-- WM-V2-5A: separate the customer request/token reference from the real service number
-- and add the CPC Serial used by New Installation work.
ALTER TABLE "work_items"
  ADD COLUMN "request_number" VARCHAR(100),
  ADD COLUMN "cpc_serial" VARCHAR(100);

-- Before WM-V2-5A the New Installation / Update Services UI stored the Token number
-- in service_number. Preserve that value under its correct meaning and leave the real
-- service number empty rather than mislabelling historical data.
UPDATE "work_items"
SET
  "request_number" = "service_number",
  "service_number" = NULL
WHERE "type" IN ('NEW_CONNECTION', 'UPDATE_SERVICES')
  AND "service_number" IS NOT NULL;

CREATE INDEX "work_items_request_number_idx" ON "work_items"("request_number");
CREATE INDEX "work_items_cpc_serial_idx" ON "work_items"("cpc_serial");
