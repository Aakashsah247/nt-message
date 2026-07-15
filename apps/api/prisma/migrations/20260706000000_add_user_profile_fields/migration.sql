-- M4: allow users to manage display-only profile information without changing official identity fields.
ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "profile_bio" VARCHAR(160);
