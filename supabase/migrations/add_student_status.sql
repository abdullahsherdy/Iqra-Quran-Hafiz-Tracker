-- Migration: replace is_active boolean with status enum on students table
-- Run this once in the Supabase SQL editor on the live project.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CONSTRAINT students_status_check CHECK (status IN ('active', 'paused', 'graduated', 'withdrawn'));

-- Backfill existing rows from is_active
UPDATE public.students SET status = 'active'    WHERE is_active = true;
UPDATE public.students SET status = 'withdrawn' WHERE is_active = false;

-- Drop old column and its index
DROP INDEX IF EXISTS idx_students_active;
ALTER TABLE public.students DROP COLUMN IF EXISTS is_active;

-- New index
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
