-- Custom message lists are private per account. A normalized name key makes
-- uniqueness deterministic even when users vary capitalization or spacing.
ALTER TABLE "chat_folders"
ADD COLUMN "name_key" VARCHAR(100);

UPDATE "chat_folders"
SET "name_key" = lower(regexp_replace(btrim("name"), '[[:space:]]+', ' ', 'g'));

-- Fail safely rather than silently deleting or renaming existing list data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "chat_folders"
    GROUP BY "account_id", "name_key"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate custom-list names exist for at least one account. Rename duplicates before applying this migration.';
  END IF;
END $$;

ALTER TABLE "chat_folders"
ALTER COLUMN "name_key" SET NOT NULL;

CREATE UNIQUE INDEX "chat_folders_account_name_key_key"
ON "chat_folders"("account_id", "name_key");
