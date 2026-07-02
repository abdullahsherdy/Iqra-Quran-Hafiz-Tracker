import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EditStudentForm } from "@/app/(admin)/admin/students/[id]/edit/edit-student-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (!admin) return { title: "تعديل الطالب" };
  const { data } = await admin.from("students").select("name").eq("id", id).maybeSingle();
  return { title: `تعديل: ${data?.name ?? "الطالب"} | اقرأ` };
}

export default async function TeacherEditStudentPage({ params }: PageProps) {
  const user = await requireRole("teacher");
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  if (!admin) return notFound();

  // Fetch student
  const { data: student } = await admin
    .from("students")
    .select("id, name, gender, birth_date, guardian_name, guardian_phone, enrollment_date, notes, is_active, memorized_juz_count")
    .eq("id", id)
    .maybeSingle();

  if (!student) return notFound();

  // Enforce assignment scoping
  const { data: assign } = await admin
    .from("teacher_student_assignments")
    .select("id")
    .eq("teacher_id", user.id)
    .eq("student_id", id)
    .is("end_date", null)
    .maybeSingle();

  if (!assign) return notFound();

  // Enforce gender scoping
  const { data: teacherUser } = await admin
    .from("users")
    .select("gender, can_view_all_genders")
    .eq("id", user.id)
    .maybeSingle();

  if (!teacherUser) return notFound();
  if (!teacherUser.can_view_all_genders && student.gender !== teacherUser.gender) {
    return notFound();
  }

  const { data: initMem } = await admin
    .from("initial_memorization")
    .select("juz_number, status, sheikh_name")
    .eq("student_id", id)
    .order("juz_number");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/teacher/students/${id}`} className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">تعديل بيانات الطالب</h2>
          <p className="text-sm text-muted-foreground">{student.name}</p>
        </div>
      </div>

      <EditStudentForm
        student={student}
        initialMem={(initMem ?? []).map((r) => ({
          juz_number: r.juz_number,
          status: r.status as "memorized" | "with_ijaza",
          sheikh_name: r.sheikh_name ?? undefined,
        }))}
        redirectBase={`/teacher/students/${id}`}
        mode="teacher"
      />
    </div>
  );
}
