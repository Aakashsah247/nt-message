-- A pending help request is actionable only while the Work is actively in
-- progress, waiting for help, or blocked. Older runtime paths could leave a
-- request pending after the Work moved to review, was closed, was cancelled,
-- or was otherwise no longer able to accept a helper response.
UPDATE "work_help_requests" AS request
SET
  "status" = 'CANCELLED'::"WorkHelpRequestStatus",
  "response_note" = COALESCE(
    request."response_note",
    'Automatically cancelled because the Work no longer accepts help requests.'
  ),
  "responded_at" = COALESCE(request."responded_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
FROM "work_items" AS work
WHERE request."work_item_id" = work."id"
  AND request."status" = 'PENDING'::"WorkHelpRequestStatus"
  AND work."status" NOT IN (
    'IN_PROGRESS'::"WorkItemStatus",
    'HELP_REQUESTED'::"WorkItemStatus",
    'BLOCKED'::"WorkItemStatus"
  );
