-- Phase 7 / P7-B: first-class cross-OrgUnit collaboration requests.
-- This remains additive. Native V3 Work gains collaboration history without
-- deleting or rewriting any legacy Work/Help/Sales history.

CREATE TYPE "WorkCollaborationStatus" AS ENUM (
  'REQUESTED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'DECLINED',
  'CANCELLED'
);

ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'COLLABORATION_REQUESTED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'COLLABORATION_ACCEPTED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'COLLABORATION_IN_PROGRESS';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'COLLABORATION_COMPLETED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'COLLABORATION_DECLINED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'COLLABORATION_CANCELLED';

CREATE TABLE "work_collaboration_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "work_stage_id" UUID,
  "participant_id" UUID,
  "source_org_unit_id" UUID NOT NULL,
  "requested_org_unit_id" UUID NOT NULL,
  "requested_by_account_id" UUID NOT NULL,
  "responded_by_account_id" UUID,
  "cancelled_by_account_id" UUID,
  "status" "WorkCollaborationStatus" NOT NULL DEFAULT 'REQUESTED',
  "purpose" VARCHAR(1000) NOT NULL,
  "needed_by" TIMESTAMPTZ(3),
  "response_reason" VARCHAR(1000),
  "cancellation_reason" VARCHAR(1000),
  "responded_at" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_collaboration_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_collaboration_requests_source_requested_check"
    CHECK ("source_org_unit_id" <> "requested_org_unit_id"),
  CONSTRAINT "work_collaboration_requests_purpose_check"
    CHECK (char_length(btrim("purpose")) >= 2),
  CONSTRAINT "work_collaboration_requests_version_check"
    CHECK ("version" >= 1)
);

CREATE INDEX "work_collaboration_requests_item_status_created_idx"
ON "work_collaboration_requests"("work_item_id", "status", "created_at");

CREATE INDEX "work_collaboration_requests_requested_unit_status_needed_idx"
ON "work_collaboration_requests"("requested_org_unit_id", "status", "needed_by");

CREATE INDEX "work_collaboration_requests_source_unit_status_created_idx"
ON "work_collaboration_requests"("source_org_unit_id", "status", "created_at");

CREATE INDEX "work_collaboration_requests_stage_status_idx"
ON "work_collaboration_requests"("work_stage_id", "status");

CREATE UNIQUE INDEX "work_collaboration_requests_participant_key"
ON "work_collaboration_requests"("participant_id");

CREATE INDEX "work_collaboration_requests_requester_created_idx"
ON "work_collaboration_requests"("requested_by_account_id", "created_at");

CREATE INDEX "work_collaboration_requests_responder_responded_idx"
ON "work_collaboration_requests"("responded_by_account_id", "responded_at");

CREATE INDEX "work_collaboration_requests_canceller_cancelled_idx"
ON "work_collaboration_requests"("cancelled_by_account_id", "cancelled_at");

-- A Work only needs one active collaboration relationship with the same
-- requested OrgUnit at a time. A later request is allowed after the previous
-- request is completed, declined or cancelled.
CREATE UNIQUE INDEX "work_collaboration_requests_active_unit_key"
ON "work_collaboration_requests"("work_item_id", "requested_org_unit_id")
WHERE "status" IN ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS');

ALTER TABLE "work_collaboration_requests"
  ADD CONSTRAINT "work_collaboration_requests_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_collaboration_requests_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "work_collaboration_requests_participant_id_fkey"
  FOREIGN KEY ("participant_id") REFERENCES "work_org_unit_participants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_collaboration_requests_source_org_unit_id_fkey"
  FOREIGN KEY ("source_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_collaboration_requests_requested_org_unit_id_fkey"
  FOREIGN KEY ("requested_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_collaboration_requests_requested_by_account_id_fkey"
  FOREIGN KEY ("requested_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_collaboration_requests_responded_by_account_id_fkey"
  FOREIGN KEY ("responded_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_collaboration_requests_cancelled_by_account_id_fkey"
  FOREIGN KEY ("cancelled_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_work_collaboration_request_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_office_id UUID;
  work_status "WorkItemStatus";
  source_office_id UUID;
  requested_office_id UUID;
  stage_work_item_id UUID;
  stage_responsibility "WorkStageResponsibleOrgUnitRule";
  participant_work_item_id UUID;
  participant_org_unit_id UUID;
  participant_role "WorkParticipantRole";
BEGIN
  SELECT work_item."office_id", work_item."status"
    INTO work_office_id, work_status
  FROM "work_items" work_item
  WHERE work_item."id" = NEW."work_item_id";

  IF work_office_id IS NULL OR work_status <> 'V3_RUNTIME' THEN
    RAISE EXCEPTION
      'Collaboration requests require native V3 Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_collaboration_requests_native_v3_work_check';
  END IF;

  SELECT unit."office_id"
    INTO source_office_id
  FROM "org_units" unit
  WHERE unit."id" = NEW."source_org_unit_id";

  SELECT unit."office_id"
    INTO requested_office_id
  FROM "org_units" unit
  WHERE unit."id" = NEW."requested_org_unit_id";

  IF (source_office_id IS NOT NULL AND source_office_id <> work_office_id)
     OR (requested_office_id IS NOT NULL AND requested_office_id <> work_office_id) THEN
    RAISE EXCEPTION
      'Collaboration OrgUnits must belong to the Work Office.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_collaboration_requests_same_office_check';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" participant
    WHERE participant."work_item_id" = NEW."work_item_id"
      AND participant."org_unit_id" = NEW."source_org_unit_id"
      AND participant."ended_at" IS NULL
      AND participant."role" <> 'OBSERVER'
  ) THEN
    RAISE EXCEPTION
      'Collaboration source OrgUnit must be an active operational Work participant.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_collaboration_requests_source_participant_check';
  END IF;

  IF NEW."work_stage_id" IS NOT NULL THEN
    SELECT stage."work_item_id", definition."responsible_org_unit_rule"
      INTO stage_work_item_id, stage_responsibility
    FROM "work_stages" stage
    JOIN "work_stage_definitions" definition
      ON definition."id" = stage."stage_definition_id"
    WHERE stage."id" = NEW."work_stage_id";

    IF FOUND AND stage_work_item_id <> NEW."work_item_id" THEN
      RAISE EXCEPTION
        'Collaboration stage must belong to the same Work.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_collaboration_requests_stage_work_check';
    END IF;

    IF FOUND AND stage_responsibility <> 'RUNTIME_REQUESTED_PARTICIPANT' THEN
      RAISE EXCEPTION
        'Stage-bound collaboration requires a runtime-requested-participant stage.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_collaboration_requests_stage_responsibility_check';
    END IF;
  END IF;

  IF NEW."participant_id" IS NOT NULL THEN
    SELECT participant."work_item_id", participant."org_unit_id", participant."role"
      INTO participant_work_item_id, participant_org_unit_id, participant_role
    FROM "work_org_unit_participants" participant
    WHERE participant."id" = NEW."participant_id";

    IF FOUND AND (
      participant_work_item_id <> NEW."work_item_id"
      OR participant_org_unit_id <> NEW."requested_org_unit_id"
      OR participant_role <> 'SUPPORTING_PARTICIPANT'
    ) THEN
      RAISE EXCEPTION
        'Collaboration participant must be the supporting participant for the requested OrgUnit on the same Work.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_collaboration_requests_participant_scope_check';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_collaboration_requests_integrity_trigger"
BEFORE INSERT OR UPDATE OF
  "work_item_id",
  "work_stage_id",
  "participant_id",
  "source_org_unit_id",
  "requested_org_unit_id"
ON "work_collaboration_requests"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_collaboration_request_integrity"();
