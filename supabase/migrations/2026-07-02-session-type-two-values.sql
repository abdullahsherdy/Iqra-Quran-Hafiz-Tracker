-- Migration: reduce session_type to two values — new_memorization, review
-- The app now only uses two session types:
--   new_memorization = تسميع جديد (new recitation/memorization)
--   review           =  مراجعة (recitation/revision)
-- 'Reciting' is removed. Any existing 'Reciting' rows are reclassified to 'review'.
-- Run via Supabase SQL editor. Safe to re-run.

-- 1) Reclassify existing Reciting rows into review (idempotent — only touches Reciting).
UPDATE public.sessions
SET session_type = 'review'
WHERE session_type = 'Reciting';

-- 2) Replace the CHECK constraint to allow only the two remaining values.
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_session_type_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('new_memorization', 'review'));

-- 3) Reload PostgREST schema cache so the API sees the tightened constraint.
NOTIFY pgrst, 'reload schema';

-- 4) Sanity check: show remaining distribution of session_type.
--    After running, only 'new_memorization' and 'review' should appear.
SELECT session_type, COUNT(*) AS cnt
FROM public.sessions
GROUP BY session_type
ORDER BY session_type;