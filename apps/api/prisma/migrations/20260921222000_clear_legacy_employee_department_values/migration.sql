-- V3 OrgMembership is authoritative for employee organization placement.
-- Clear the retired Employee.department compatibility value so active runtime
-- data cannot carry legacy fixed-Department state.
UPDATE "employees"
SET "department" = NULL,
    "updated_at" = NOW()
WHERE "department" IS NOT NULL;
