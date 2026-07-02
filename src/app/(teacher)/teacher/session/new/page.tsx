import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAssignedStudentIds } from "@/lib/auth/student-access";
import { SessionForm } from "@/components/session-form";

export const metadata = { title: "تسجيل جلسة | اقرأ" };

export default async function TeacherNewSessionPage() {
  const user = await requireRole("teacher");

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return <div className="text-destructive">خطأ في الاتصال</div>;
  }

  const studentIds = await getAssignedStudentIds(admin, user.id);

  const { data: teacherUser } = await admin
    .from("users")
    .select("gender, can_view_all_genders")
    .eq("id", user.id)
    .maybeSingle();

  let studentsQuery = admin
    .from("students")
    .select("id, name")
    .in("id", studentIds.length > 0 ? studentIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_active", true)
    .order("name");

  if (teacherUser && !teacherUser.can_view_all_genders) {
    studentsQuery = studentsQuery.eq("gender", teacherUser.gender);
  }

  const { data: students } = await studentsQuery;
  const { data: surahs } = await admin
    .from("surahs")
    .select("id, name_arabic, total_ayahs")
    .order("id");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">تسجيل جلسة</h2>
        <p className="text-sm text-muted-foreground">تسجيل جلسة حفظ أو مراجعة أو سماع</p>
      </div>

      <SessionForm
        students={students ?? []}
        surahs={surahs ?? []}
      />
    </div>
  );
}
