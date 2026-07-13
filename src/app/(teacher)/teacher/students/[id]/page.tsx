import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Pencil, Award } from "lucide-react";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { LevelBadge } from "@/components/level-badge";
import { StudentProfileTabs } from "@/components/student-profile-tabs";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata() {
  return { title: `ملف الطالب | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function TeacherStudentProfilePage({ params }: PageProps) {
  const user = await requireRole("teacher");
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  if (!admin) return notFound();

  // Fetch student details
  const { data: student } = await admin
    .from("students")
    .select("*")
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

  // Active teachers for this student
  const { data: activeAssignments } = await admin
    .from("teacher_student_assignments")
    .select("id, teacher_id, start_date, users!teacher_student_assignments_teacher_id_fkey(id, name)")
    .eq("student_id", id)
    .is("end_date", null);

  // Initial memorization
  const { data: initialMem } = await admin
    .from("initial_memorization")
    .select("juz_number, status, sheikh_name")
    .eq("student_id", id)
    .order("juz_number");

  const initMemValue = (initialMem ?? []).map((r) => ({
    juz_number: r.juz_number,
    status: r.status as "memorized" | "with_ijaza",
    sheikh_name: r.sheikh_name ?? undefined,
  }));

  const age = student.birth_date
    ? Math.floor((Date.now() - new Date(student.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/teacher/students" className="btn-secondary px-2 py-1.5 text-xs shrink-0">
            <ArrowRight className="size-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold truncate">
              {student.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <GenderBadge value={student.gender as "male" | "female"} />
              <StudentStatusBadge value={student.status as StudentStatus} />
              {age ? <p className="text-sm text-muted-foreground">{age} سنة</p> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/teacher/ijazat/new?student_id=${id}`} className="btn-primary gap-1.5 text-sm px-3 py-2">
            <Award className="size-4" />
            <span>منح إجازة</span>
          </Link>
          <Link href={`/teacher/students/${id}/edit`} className="btn-secondary gap-1.5 px-3 py-2">
            <Pencil className="size-4" />
            <span>تعديل</span>
          </Link>
        </div>
      </div>

      {/* Profile grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Info */}
        <div className="card space-y-3">
          <h3 className="font-semibold border-b border-border pb-3 mb-1">البيانات الأساسية</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">ولي الأمر</dt>
              <dd className="font-medium">{student.guardian_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">هاتف ولي الأمر</dt>
              <dd dir="ltr">{student.guardian_phone}</dd>
            </div>
            {student.birth_date && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">تاريخ الميلاد</dt>
                <dd>{new Date(student.birth_date).toLocaleDateString("ar-EG")}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">تاريخ الانضمام</dt>
              <dd>{new Date(student.enrollment_date).toLocaleDateString("ar-EG")}</dd>
            </div>
            {student.notes && (
              <div className="pt-1">
                <dt className="text-muted-foreground mb-1">ملاحظات</dt>
                <dd className="rounded-md bg-secondary p-2 text-xs">{student.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Progress summary */}
        <div className="card space-y-3">
          <h3 className="font-semibold border-b border-border pb-3 mb-1">ملخص التقدم</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">المستوى</span>
              <LevelBadge memorizedJuzCount={student.memorized_juz_count} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">الأجزاء المحفوظة</span>
              <span className="font-bold text-lg text-primary">
                {student.memorized_juz_count}
                <span className="text-sm font-normal text-muted-foreground">/30</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">الإجازات</span>
              <span className="font-semibold text-[#16a34a]">{student.ijaza_juz_count}</span>
            </div>
            {student.last_session_date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">آخر جلسة</span>
                <span>{new Date(student.last_session_date).toLocaleDateString("ar-EG")}</span>
              </div>
            )}
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>نسبة الحفظ</span>
                <span>{Math.round((student.memorized_juz_count / 30) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-emerald-950/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round((student.memorized_juz_count / 30) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Current teachers */}
      <div className="card space-y-3">
        <h3 className="font-semibold border-b border-border pb-3 mb-1">
          المحفظون الحاليون ({activeAssignments?.length ?? 0})
        </h3>
        {!activeAssignments?.length ? (
          <p className="text-sm text-muted-foreground">لا يوجد محفظون مسندون حالياً</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeAssignments.map((a) => {
              const u = a.users as unknown as { id: string; name: string } | null;
              return u ? (
                <span
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3.5 py-3 shadow-xs"
                >
                  <div className="size-2 rounded-full bg-primary shrink-0" />
                  <span className="font-semibold text-sm text-foreground">{u.name}</span>
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      <StudentProfileTabs studentId={id} initMemValue={initMemValue} />
    </div>
  );
}
