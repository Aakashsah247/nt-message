CREATE TYPE "ActivityEventType" AS ENUM (
  'LOGIN',
  'LOGOUT',
  'PAGE_VIEW',
  'BUTTON_CLICK',
  'ACTIVE_HEARTBEAT',
  'IDLE_STARTED',
  'IDLE_HEARTBEAT',
  'ACTIVE_RESUMED',
  'EMERGENCY_ALERT_SENT',
  'SESSION_POLICY_LOGOUT'
);

CREATE TABLE "activity_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "session_id" UUID,
  "event_type" "ActivityEventType" NOT NULL,
  "page_path" VARCHAR(180),
  "element_label" VARCHAR(120),
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_activity_summaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "activity_date" DATE NOT NULL,
  "first_login_at" TIMESTAMPTZ(3),
  "last_logout_at" TIMESTAMPTZ(3),
  "last_active_at" TIMESTAMPTZ(3),
  "active_minutes" INTEGER NOT NULL DEFAULT 0,
  "idle_minutes" INTEGER NOT NULL DEFAULT 0,
  "pages_visited_count" INTEGER NOT NULL DEFAULT 0,
  "actions_count" INTEGER NOT NULL DEFAULT 0,
  "emergency_alerts_count" INTEGER NOT NULL DEFAULT 0,
  "after_hours_login_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "daily_activity_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_activity_summaries_account_date_key" ON "daily_activity_summaries"("account_id", "activity_date");
CREATE INDEX "activity_events_account_occurred_idx" ON "activity_events"("account_id", "occurred_at");
CREATE INDEX "activity_events_type_occurred_idx" ON "activity_events"("event_type", "occurred_at");
CREATE INDEX "activity_events_session_occurred_idx" ON "activity_events"("session_id", "occurred_at");
CREATE INDEX "activity_events_occurred_idx" ON "activity_events"("occurred_at");
CREATE INDEX "daily_activity_summaries_activity_date_idx" ON "daily_activity_summaries"("activity_date");
CREATE INDEX "daily_activity_summaries_account_date_idx" ON "daily_activity_summaries"("account_id", "activity_date");

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_activity_summaries" ADD CONSTRAINT "daily_activity_summaries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
