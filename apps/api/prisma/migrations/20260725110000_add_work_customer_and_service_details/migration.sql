-- Add structured customer and network-service details without rewriting existing work records.
CREATE TYPE "WorkServiceType" AS ENUM ('DATA', 'VOICE', 'IPTV', 'SIP', 'OTHER');

ALTER TABLE "work_items"
  ADD COLUMN "customer_name" VARCHAR(160),
  ADD COLUMN "customer_contact_number" VARCHAR(30),
  ADD COLUMN "service_types" "WorkServiceType"[] NOT NULL DEFAULT ARRAY[]::"WorkServiceType"[],
  ADD COLUMN "other_service_text" VARCHAR(160),
  ADD COLUMN "service_number" VARCHAR(100),
  ADD COLUMN "olt" VARCHAR(100),
  ADD COLUMN "fdc_name" VARCHAR(100),
  ADD COLUMN "fap_name" VARCHAR(100);

CREATE INDEX "work_items_service_number_idx" ON "work_items"("service_number");
CREATE INDEX "work_items_customer_contact_idx" ON "work_items"("customer_contact_number");
