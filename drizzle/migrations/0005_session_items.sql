-- 0005: Multi-entry sessions — split session content into session_items table.
-- The sessions table becomes a parent (date, teacher, student, overall rating),
-- and each session_items row represents one Quran portion recited in that session.

-- Step 1: Create session_items table
CREATE TABLE "session_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "session_type" text NOT NULL,
  "surah_id" integer NOT NULL REFERENCES "surahs"("id"),
  "from_ayah" integer NOT NULL,
  "to_ayah" integer NOT NULL,
  "rating" text NOT NULL,
  "pages" integer,
  "notes" text
);

-- Step 2: Add CHECK constraints to session_items
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_type_check"
  CHECK ("session_type" IN ('new_memorization', 'review'));
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_rating_check"
  CHECK ("rating" IN ('excellent', 'good', 'weak'));
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_pages_check"
  CHECK ("pages" IS NULL OR "pages" >= 0);
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_valid_ayah_range"
  CHECK ("from_ayah" <= "to_ayah");

-- Step 3: Add indexes to session_items
CREATE INDEX "idx_session_items_session" ON "session_items" ("session_id");

-- Step 4: Migrate existing session data into session_items (one item per session)
INSERT INTO "session_items" ("session_id", "session_type", "surah_id", "from_ayah", "to_ayah", "rating", "pages", "notes")
SELECT "id", "session_type", "surah_id", "from_ayah", "to_ayah", "rating", "pages", "notes"
FROM "sessions";

-- Step 5: Add overall_rating column to sessions (copy from existing rating)
ALTER TABLE "sessions" ADD COLUMN "overall_rating" text NOT NULL DEFAULT 'good';
UPDATE "sessions" SET "overall_rating" = "rating";

-- Step 6: Drop old columns and constraints from sessions
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_session_type_check";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_rating_check";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_pages_check";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_valid_ayah_range";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "session_type";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "surah_id";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "from_ayah";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "to_ayah";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "rating";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "pages";

-- Step 7: Add overall_rating CHECK constraint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_overall_rating_check"
  CHECK ("overall_rating" IN ('excellent', 'good', 'weak'));