import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAssignedStudentIds } from "@/lib/auth/student-access";
import { GrantIjazaForm } from "@/components/grant-ijaza-form";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "منح إجازة | اقرأ" };

interface PageProps {
  searchParams: Promise<{ student_id?: string }>;
}

export default async function TeacherGrantIjazaPage({ searchParams }: PageProps) {
  const user = await requireRole("teacher");
  const { student_id: preselectedId } = await searchParams;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return <div className="text-destructive p-4">خطأ في الاتصال بالخادم</div>;
  }

  // Load teacher's assigned active students only
  const assignedIds = await getAssignedStudentIds(admin, user.id);

  const { data: teacherUser } = await admin
    .from("users")
    .select("gender, can_view_all_genders")
    .eq("id", user.id)
    .maybeSingle();

  let studentsQuery = admin
    .from("students")
    .select("id, name")
    .in(
      "id",
      assignedIds.length > 0 ? assignedIds : ["00000000-0000-0000-0000-000000000000"]
    )
    .eq("is_active", true)
    .order("name");

  if (teacherUser && !teacherUser.can_view_all_genders) {
    studentsQuery = studentsQuery.eq("gender", teacherUser.gender);
  }

  const { data: students } = await studentsQuery;

  return (
    <div className="space-y-6 mx-auto max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/teacher/students" className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">منح إجازة</h2>
          <p className="text-sm text-muted-foreground">
            تسجيل إجازة لأحد طلابك المسندين إليك
          </p>
        </div>
      </div>

      {students && students.length > 0 ? (
        <GrantIjazaForm
          students={students}
          preselectedStudentId={preselectedId}
          redirectTo={
            preselectedId
              ? `/teacher/students/${preselectedId}`
              : "/teacher/students"
          }
        />
      ) : (
        <div className="card text-center py-12 text-sm text-muted-foreground">
          <p>لا يوجد طلاب نشطون مسندون إليك حالياً.</p>
          <p className="mt-1 text-xs">تواصل مع المدير لإسناد طلاب.</p>
        </div>
      )}
    </div>
  );
}
