-- Migration: Auto-derive attendance from sessions
-- This migration:
-- 1. Removes the 'late' status from the attendance table check constraint
-- 2. Makes teacher_id nullable (since attendance is derived from sessions)
-- 3. Removes the UNIQUE constraint on (student_id, attendance_date) since we may need to recalculate
-- 4. Optionally backfills present rows from existing sessions

-- Step 1: Remove the 'late' status from the check constraint
ALTER TABLE public.attendance 
DROP CONSTRAINT IF EXISTS attendance_status_check;

ALTER TABLE public.attendance 
ADD CONSTRAINT attendance_status_check 
CHECK (status IN ('present', 'absent'));

-- Step 2: Make teacher_id nullable (attendance is derived from sessions, not tied to a specific teacher)
ALTER TABLE public.attendance 
ALTER COLUMN teacher_id DROP NOT NULL;

-- Step 3: Remove the UNIQUE constraint to allow recalculation
ALTER TABLE public.attendance 
DROP CONSTRAINT IF EXISTS attendance_student_id_attendance_date_key;

-- Step 4: Optional backfill - insert present rows for existing sessions
-- This creates attendance records for all existing sessions as "present"
-- Note: This is a one-time backfill. After this, attendance will be maintained by the application logic.
INSERT INTO public.attendance (student_id, teacher_id, attendance_date, status, notes)
SELECT 
  s.student_id,
  s.teacher_id,
  s.session_date,
  'present'::text,
  NULL
FROM public.sessions s
ON CONFLICT DO NOTHING; -- Skip if attendance record already exists

-- Step 5: Create index for faster attendance queries
CREATE INDEX IF NOT EXISTS idx_attendance_student_date 
ON public.attendance(student_id, attendance_date DESC);
