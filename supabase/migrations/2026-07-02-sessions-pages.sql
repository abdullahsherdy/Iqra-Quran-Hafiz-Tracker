-- Migration: add pages column to sessions
-- Applies to the live Supabase project. Safe to re-run (idempotent guardians).
-- Run via Supabase SQL editor.

-- 1) Add nullable INTEGER pages column to sessions (optional # of pages
--    memorized/recited in the session, alongside the ayah range).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name = 'pages'
  ) THEN
    ALTER TABLE public.sessions
      ADD COLUMN pages INTEGER CHECK (pages IS NULL OR pages >= 0);
  END IF;
END $$;

-- 2) Backfilling not needed: pages is nullable (defaults to NULL for past rows).

-- 3) Tell PostgREST (the Supabase API layer) to reload its schema cache so it
--    picks up the new column. The "schema cache" error happens when PostgREST
--    still serves the pre-ALTER table definition. This call forces a refresh.
NOTIFY pgrst, 'reload schema';

-- 4) Sanity check: confirm the column is now visible.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sessions'
ORDER BY ordinal_position;

-- NOTE: student permanent-delete cascade is handled in application code via the
-- service-role admin client (see /api/students/[id] DELETE ?permanent=true).
-- No ON DELETE CASCADE is added to FKs so accidental DB-level deletes stay safe.