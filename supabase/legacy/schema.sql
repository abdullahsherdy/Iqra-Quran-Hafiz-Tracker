CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher')),
  phone VARCHAR(20),
  gender TEXT CHECK (gender IN ('male', 'female')),
  can_view_all_genders BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  birth_date DATE,
  guardian_name VARCHAR(100) NOT NULL,
  guardian_phone VARCHAR(20) NOT NULL,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'graduated', 'withdrawn')),
  memorized_juz_count SMALLINT NOT NULL DEFAULT 0,
  ijaza_juz_count SMALLINT NOT NULL DEFAULT 0,
  last_session_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teacher_student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surahs (
  id INTEGER PRIMARY KEY,
  name_arabic VARCHAR(50) NOT NULL,
  juz_number INTEGER NOT NULL,
  total_ayahs INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public.juz_boundaries (
  juz_number INTEGER NOT NULL CHECK (juz_number BETWEEN 1 AND 30),
  surah_id INTEGER NOT NULL REFERENCES public.surahs(id),
  from_ayah INTEGER NOT NULL,
  to_ayah INTEGER NOT NULL,
  PRIMARY KEY (juz_number, surah_id),
  CONSTRAINT valid_juz_range CHECK (from_ayah <= to_ayah)
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id),
  teacher_id UUID NOT NULL REFERENCES public.users(id),
  session_date DATE NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('new_memorization', 'review')),
  surah_id INTEGER NOT NULL REFERENCES public.surahs(id),
  from_ayah INTEGER NOT NULL,
  to_ayah INTEGER NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('excellent', 'good', 'weak')),
  pages INTEGER CHECK (pages IS NULL OR pages >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_ayah_range CHECK (from_ayah <= to_ayah)
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id),
  teacher_id UUID NOT NULL REFERENCES public.users(id),
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS public.ijazat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id),
  granted_by UUID NOT NULL REFERENCES public.users(id),
  ijaza_type TEXT NOT NULL CHECK (ijaza_type IN ('juz', 'full_quran')),
  juz_number INTEGER CHECK (juz_number BETWEEN 1 AND 30),
  sheikh_name VARCHAR(100) NOT NULL,
  ijaza_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT juz_required_if_type CHECK (
    (ijaza_type = 'juz' AND juz_number IS NOT NULL) OR
    (ijaza_type = 'full_quran' AND juz_number IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.initial_memorization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id),
  juz_number INTEGER NOT NULL CHECK (juz_number BETWEEN 1 AND 30),
  status TEXT NOT NULL CHECK (status IN ('memorized', 'with_ijaza')),
  sheikh_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, juz_number)
);

CREATE INDEX IF NOT EXISTS idx_students_gender ON public.students(gender);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_students_juzcount ON public.students(memorized_juz_count);
CREATE INDEX IF NOT EXISTS idx_students_ijazacount ON public.students(ijaza_juz_count);
CREATE INDEX IF NOT EXISTS idx_students_lastsession ON public.students(last_session_date DESC);
CREATE INDEX IF NOT EXISTS idx_students_birthdate ON public.students(birth_date);
CREATE INDEX IF NOT EXISTS idx_students_enrollment ON public.students(enrollment_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_assignment
  ON public.teacher_student_assignments(teacher_id, student_id)
  WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_active_assignments
  ON public.teacher_student_assignments(student_id)
  WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_student ON public.sessions(student_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON public.sessions(teacher_id, session_date DESC);
