-- Attendance is now auto-derived from sessions only.
-- Remove manual attendance columns: teacher_id, notes, recorded_manually.
-- Simplify status check to only 'present'.

-- Drop the old check constraint and add the new one
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check CHECK (status IN ('present'));

-- Drop columns no longer needed
ALTER TABLE public.attendance DROP COLUMN IF EXISTS recorded_manually;
ALTER TABLE public.attendance DROP COLUMN IF EXISTS teacher_id;
ALTER TABLE public.attendance DROP COLUMN IF EXISTS notes;

-- Remove the duplicate/misleading index on session_items
DROP INDEX IF EXISTS idx_session_items_student_date;
