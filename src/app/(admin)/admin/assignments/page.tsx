import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AssignmentsClient } from "./assignments-client";

export const metadata = { title: "إسناد الطلاب | اقرأ" };

export default async function AdminAssignmentsPage() {
  await requireRole("admin");

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return <div className="text-destructive">Supabase client error</div>;
  }

  // Fetch all active teachers
  const { data: teachers } = await admin
    .from("users")
    .select("id, name, gender, can_view_all_genders")
    .eq("role", "teacher")
    .eq("is_active", true)
    .order("name");

  // Fetch all active students
  const { data: students } = await admin
    .from("students")
    .select("id, name, gender, memorized_juz_count, is_active")
    .eq("is_active", true)
    .order("name");

  // Fetch all active assignments
  const { data: activeAssignments } = await admin
    .from("teacher_student_assignments")
    .select("id, teacher_id, student_id, start_date, users!teacher_student_assignments_teacher_id_fkey(id, name)")
    .is("end_date", null);

  // Group assignments by student
  const studentAssignments: Record<string, Array<{ id: string; teacher_id: string; name: string; start_date: string }>> = {};
  for (const a of activeAssignments ?? []) {
    if (!studentAssignments[a.student_id]) {
      studentAssignments[a.student_id] = [];
    }
    const u = a.users as unknown as { id: string; name: string } | null;
    studentAssignments[a.student_id].push({
      id: a.id,
      teacher_id: a.teacher_id,
      name: u?.name ?? "",
      start_date: a.start_date,
    });
  }

  const enrichedStudents = (students ?? []).map((s) => ({
    ...s,
    assignments: studentAssignments[s.id] ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">إسناد الطلاب</h2>
        <p className="text-sm text-muted-foreground">
          إدارة إسناد الطلاب للمحفظين. يمكن إسناد الطالب لأكثر من محفظ في نفس الوقت.
        </p>
      </div>

      <AssignmentsClient
        students={enrichedStudents}
        teachers={teachers ?? []}
      />
    </div>
  );
}
