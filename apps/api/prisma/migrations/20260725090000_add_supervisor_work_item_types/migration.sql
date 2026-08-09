-- Supervisor-approved M20 work classifications.
ALTER TYPE "WorkItemType" ADD VALUE IF NOT EXISTS 'NEW_CONNECTION';
ALTER TYPE "WorkItemType" ADD VALUE IF NOT EXISTS 'UPDATE_SERVICES';
