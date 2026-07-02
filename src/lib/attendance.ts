export type AttendanceStatus = "present" | "absent";

export interface AttendanceDay {
  date: string;
  status: AttendanceStatus;
}
export function computeAttendanceCalendar(
  sessionDates: string[],
  enrollmentDate: string,
  today: string = new Date().toISOString().split("T")[0]
): AttendanceDay[] {
  const sessionSet = new Set(sessionDates);
  const result: AttendanceDay[] = [];

  const start = new Date(enrollmentDate);
  const end = new Date(today);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const dateStr = d.toISOString().split("T")[0];

    if (dayOfWeek === 5) continue;

    const status: AttendanceStatus = sessionSet.has(dateStr) ? "present" : "absent";
    result.push({ date: dateStr, status });
  }

  return result;
}

export async function recalculateStudentAttendance(
  admin: import("@supabase/supabase-js").SupabaseClient,
  studentId: string
): Promise<void> {
  const { data: student } = await admin
    .from("students")
    .select("enrollment_date")
    .eq("id", studentId)
    .single();

  if (!student?.enrollment_date) {
    throw new Error("Student enrollment_date is required");
  }

  const { data: sessions } = await admin
    .from("sessions")
    .select("session_date")
    .eq("student_id", studentId);

  const sessionDates = (sessions ?? []).map((s) => s.session_date);

  const calendar = computeAttendanceCalendar(
    sessionDates,
    student.enrollment_date
  );

  await admin.from("attendance").delete().eq("student_id", studentId);

  if (calendar.length > 0) {
    const records = calendar.map((day) => ({
      student_id: studentId,
      teacher_id: null,
      attendance_date: day.date,
      status: day.status,
      notes: null,
    }));

    await admin.from("attendance").insert(records);
  }
}
