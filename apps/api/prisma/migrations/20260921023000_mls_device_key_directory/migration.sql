-- Phase 2 MLS E2EE: device registry + one-time KeyPackage directory.
-- Private MLS secrets remain client-side; the server stores only public/opaque material.

CREATE TYPE "MlsDeviceState" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "mls_devices" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "client_device_id" VARCHAR(120) NOT NULL,
    "display_name" VARCHAR(120),
    "credential_identity" TEXT NOT NULL,
    "state" "MlsDeviceState" NOT NULL DEFAULT 'ACTIVE',
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "mls_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mls_key_packages" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "key_package_ref" VARCHAR(160) NOT NULL,
    "key_package" TEXT NOT NULL,
    "cipher_suite" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mls_key_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mls_devices_account_client_device_key"
ON "mls_devices"("account_id", "client_device_id");

CREATE INDEX "mls_devices_account_state_idx"
ON "mls_devices"("account_id", "state");

CREATE UNIQUE INDEX "mls_key_packages_key_package_ref_key"
ON "mls_key_packages"("key_package_ref");

CREATE INDEX "mls_key_packages_device_consumed_created_idx"
ON "mls_key_packages"("device_id", "consumed_at", "created_at");

CREATE INDEX "mls_key_packages_expires_at_idx"
ON "mls_key_packages"("expires_at");

ALTER TABLE "mls_devices"
ADD CONSTRAINT "mls_devices_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mls_key_packages"
ADD CONSTRAINT "mls_key_packages_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "mls_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
