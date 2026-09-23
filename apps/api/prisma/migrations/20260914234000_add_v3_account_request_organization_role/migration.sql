-- V3 account requests keep authentication class separate from organization leadership.
CREATE TYPE "AccountRequestOrganizationRole" AS ENUM ('EMPLOYEE', 'ORG_UNIT_HEAD');

ALTER TABLE "account_requests"
ADD COLUMN "requested_organization_role" "AccountRequestOrganizationRole" NOT NULL DEFAULT 'EMPLOYEE';

CREATE INDEX "account_requests_org_role_status_idx"
ON "account_requests"("requested_organization_role", "status");
