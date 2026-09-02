-- NT Message hierarchy V3 delegated capability foundation.

CREATE TABLE "delegated_permissions" (
  "id" UUID NOT NULL,

  "grantee_account_id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "org_unit_id" UUID,

  "capability" VARCHAR(100) NOT NULL,
  "include_descendants" BOOLEAN NOT NULL DEFAULT false,
  "can_redelegate" BOOLEAN NOT NULL DEFAULT false,

  "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_until" TIMESTAMPTZ(3),

  "granted_by_account_id" UUID NOT NULL,
  "revoked_by_account_id" UUID,
  "revoked_at" TIMESTAMPTZ(3),

  "grant_reason" VARCHAR(500) NOT NULL,
  "revoke_reason" VARCHAR(500),

  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "delegated_permissions_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "delegated_permissions_effective_period_check"
    CHECK (
      "effective_until" IS NULL
      OR "effective_until" > "effective_from"
    ),

  CONSTRAINT "delegated_permissions_revocation_period_check"
    CHECK (
      "revoked_at" IS NULL
      OR "revoked_at" >= "effective_from"
    ),

  CONSTRAINT "delegated_permissions_revocation_audit_check"
    CHECK (
      (
        "revoked_at" IS NULL
        AND "revoked_by_account_id" IS NULL
        AND "revoke_reason" IS NULL
      )
      OR
      (
        "revoked_at" IS NOT NULL
        AND "revoked_by_account_id" IS NOT NULL
        AND "revoke_reason" IS NOT NULL
      )
    )
);

CREATE INDEX
  "delegated_permissions_grantee_capability_active_idx"
ON "delegated_permissions"
  ("grantee_account_id", "capability", "revoked_at", "effective_until");

CREATE INDEX
  "delegated_permissions_scope_capability_idx"
ON "delegated_permissions"
  ("office_id", "org_unit_id", "capability");

CREATE INDEX
  "delegated_permissions_granted_by_idx"
ON "delegated_permissions"
  ("granted_by_account_id");

CREATE INDEX
  "delegated_permissions_revoked_by_idx"
ON "delegated_permissions"
  ("revoked_by_account_id");

CREATE INDEX
  "delegated_permissions_effective_period_idx"
ON "delegated_permissions"
  ("effective_from", "effective_until");

CREATE INDEX
  "delegated_permissions_revoked_at_idx"
ON "delegated_permissions"
  ("revoked_at");

ALTER TABLE "delegated_permissions"
ADD CONSTRAINT "delegated_permissions_grantee_account_id_fkey"
FOREIGN KEY ("grantee_account_id")
REFERENCES "accounts"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "delegated_permissions"
ADD CONSTRAINT "delegated_permissions_office_id_fkey"
FOREIGN KEY ("office_id")
REFERENCES "offices"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "delegated_permissions"
ADD CONSTRAINT "delegated_permissions_org_unit_id_fkey"
FOREIGN KEY ("org_unit_id")
REFERENCES "org_units"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "delegated_permissions"
ADD CONSTRAINT "delegated_permissions_granted_by_account_id_fkey"
FOREIGN KEY ("granted_by_account_id")
REFERENCES "accounts"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "delegated_permissions"
ADD CONSTRAINT "delegated_permissions_revoked_by_account_id_fkey"
FOREIGN KEY ("revoked_by_account_id")
REFERENCES "accounts"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
