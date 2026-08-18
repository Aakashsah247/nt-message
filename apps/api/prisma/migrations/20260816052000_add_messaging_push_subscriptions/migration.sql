-- Browser push subscriptions are device/session scoped so revoked sessions cannot receive notifications.
CREATE TABLE "messaging_push_subscriptions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(512) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "show_preview" BOOLEAN NOT NULL DEFAULT true,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "user_agent" VARCHAR(500),
    "last_successful_push_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messaging_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_push_subscriptions_endpoint_key"
ON "messaging_push_subscriptions"("endpoint");

CREATE INDEX "messaging_push_subscriptions_account_muted_updated_idx"
ON "messaging_push_subscriptions"("account_id", "is_muted", "updated_at");

CREATE INDEX "messaging_push_subscriptions_session_idx"
ON "messaging_push_subscriptions"("auth_session_id");

ALTER TABLE "messaging_push_subscriptions"
ADD CONSTRAINT "messaging_push_subscriptions_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messaging_push_subscriptions"
ADD CONSTRAINT "messaging_push_subscriptions_auth_session_id_fkey"
FOREIGN KEY ("auth_session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
