-- Add an explicit contact channel so work tickets can validate mobile and landline numbers differently.
CREATE TYPE "WorkContactType" AS ENUM ('MOBILE', 'TELEPHONE');

ALTER TABLE "work_items"
ADD COLUMN "customer_contact_type" "WorkContactType";
