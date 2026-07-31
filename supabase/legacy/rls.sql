GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.students TO authenticated;
GRANT SELECT ON public.teacher_student_assignments TO authenticated;
GRANT SELECT ON public.surahs TO authenticated;
GRANT SELECT ON public.juz_boundaries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ijazat TO authenticated;
GRANT SELECT ON public.initial_memorization TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.juz_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ijazat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initial_memorization ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned(student_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_student_assignments assignments
    JOIN public.users teachers ON teachers.id = assignments.teacher_id
    WHERE assignments.student_id = student_uuid
      AND assignments.teacher_id = auth.uid()
      AND assignments.end_date IS NULL
      AND teachers.role = 'teacher'
      AND teachers.is_active = true
  );
$$;

DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self
ON public.users
FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS assignments_select_visible ON public.teacher_student_assignments;
CREATE POLICY assignments_select_visible
ON public.teacher_student_assignments
FOR SELECT
TO authenticated
USING (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS surahs_select_all ON public.surahs;
CREATE POLICY surahs_select_all
ON public.surahs
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS juz_boundaries_select_all ON public.juz_boundaries;
CREATE POLICY juz_boundaries_select_all
ON public.juz_boundaries
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS students_select_visible ON public.students;
CREATE POLICY students_select_visible
ON public.students
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR (
    public.is_assigned(id)
    AND EXISTS (
      SELECT 1
      FROM public.users app_user
      WHERE app_user.id = auth.uid()
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = students.gender
        )
    )
  )
);

DROP POLICY IF EXISTS students_insert_teacher ON public.students;
CREATE POLICY students_insert_teacher
ON public.students
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.users app_user
    WHERE app_user.id = auth.uid()
      AND app_user.role = 'teacher'
      AND app_user.is_active = true
      AND (
        app_user.can_view_all_genders = true
        OR app_user.gender = students.gender
      )
  )
);

DROP POLICY IF EXISTS students_update_assigned ON public.students;
CREATE POLICY students_update_assigned
ON public.students
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR (
    public.is_assigned(id)
    AND EXISTS (
      SELECT 1
      FROM public.users app_user
      WHERE app_user.id = auth.uid()
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = students.gender
        )
    )
  )
)
WITH CHECK (
  public.is_admin() OR (
    public.is_assigned(id)
    AND EXISTS (
      SELECT 1
      FROM public.users app_user
      WHERE app_user.id = auth.uid()
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = students.gender
        )
    )
  )
);

DROP POLICY IF EXISTS sessions_select_assigned ON public.sessions;
CREATE POLICY sessions_select_assigned
ON public.sessions
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.students student
    JOIN public.users app_user ON app_user.id = auth.uid()
    WHERE student.id = sessions.student_id
      AND public.is_assigned(sessions.student_id)
      AND app_user.role = 'teacher'
      AND app_user.is_active = true
      AND (
        app_user.can_view_all_genders = true
        OR app_user.gender = student.gender
      )
  )
);

DROP POLICY IF EXISTS sessions_insert_assigned ON public.sessions;
CREATE POLICY sessions_insert_assigned
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = sessions.student_id
        AND public.is_assigned(sessions.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
);

DROP POLICY IF EXISTS sessions_update_assigned ON public.sessions;
CREATE POLICY sessions_update_assigned
ON public.sessions
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = sessions.student_id
        AND public.is_assigned(sessions.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
)
WITH CHECK (
  public.is_admin() OR (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = sessions.student_id
        AND public.is_assigned(sessions.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
);

DROP POLICY IF EXISTS attendance_select_assigned ON public.attendance;
CREATE POLICY attendance_select_assigned
ON public.attendance
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.students student
    JOIN public.users app_user ON app_user.id = auth.uid()
    WHERE student.id = attendance.student_id
      AND public.is_assigned(attendance.student_id)
      AND app_user.role = 'teacher'
      AND app_user.is_active = true
      AND (
        app_user.can_view_all_genders = true
        OR app_user.gender = student.gender
      )
  )
);

DROP POLICY IF EXISTS attendance_insert_assigned ON public.attendance;
CREATE POLICY attendance_insert_assigned
ON public.attendance
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = attendance.student_id
        AND public.is_assigned(attendance.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
);

DROP POLICY IF EXISTS attendance_update_assigned ON public.attendance;
CREATE POLICY attendance_update_assigned
ON public.attendance
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = attendance.student_id
        AND public.is_assigned(attendance.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
)
WITH CHECK (
  public.is_admin() OR (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = attendance.student_id
        AND public.is_assigned(attendance.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
);

DROP POLICY IF EXISTS ijazat_select_assigned ON public.ijazat;
CREATE POLICY ijazat_select_assigned
ON public.ijazat
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.students student
    JOIN public.users app_user ON app_user.id = auth.uid()
    WHERE student.id = ijazat.student_id
      AND public.is_assigned(ijazat.student_id)
      AND app_user.role = 'teacher'
      AND app_user.is_active = true
      AND (
        app_user.can_view_all_genders = true
        OR app_user.gender = student.gender
      )
  )
);

DROP POLICY IF EXISTS ijazat_insert_assigned ON public.ijazat;
CREATE POLICY ijazat_insert_assigned
ON public.ijazat
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    granted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = ijazat.student_id
        AND public.is_assigned(ijazat.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
);

DROP POLICY IF EXISTS ijazat_update_assigned ON public.ijazat;
CREATE POLICY ijazat_update_assigned
ON public.ijazat
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR (
    granted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = ijazat.student_id
        AND public.is_assigned(ijazat.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
)
WITH CHECK (
  public.is_admin() OR (
    granted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.students student
      JOIN public.users app_user ON app_user.id = auth.uid()
      WHERE student.id = ijazat.student_id
        AND public.is_assigned(ijazat.student_id)
        AND app_user.role = 'teacher'
        AND app_user.is_active = true
        AND (
          app_user.can_view_all_genders = true
          OR app_user.gender = student.gender
        )
    )
  )
);

DROP POLICY IF EXISTS initial_memorization_select_assigned ON public.initial_memorization;
CREATE POLICY initial_memorization_select_assigned
ON public.initial_memorization
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.students student
    JOIN public.users app_user ON app_user.id = auth.uid()
    WHERE student.id = initial_memorization.student_id
      AND public.is_assigned(initial_memorization.student_id)
      AND app_user.role = 'teacher'
      AND app_user.is_active = true
      AND (
        app_user.can_view_all_genders = true
        OR app_user.gender = student.gender
      )
  )
);
