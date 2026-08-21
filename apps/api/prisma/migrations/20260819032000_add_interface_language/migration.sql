ALTER TABLE "accounts"
ADD COLUMN "interface_language" VARCHAR(8) NOT NULL DEFAULT 'en';

ALTER TABLE "accounts"
ADD CONSTRAINT "accounts_interface_language_check"
CHECK ("interface_language" IN ('en', 'ne'));
