import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Pencil, Award } from "lucide-react";
import { GenderBadge } from "@/components/badges";
import { LevelBadge } from "@/components/level-badge";
import { StudentProfileTabs } from "@/components/student-profile-tabs";
import { StudentDeleteButton } from "@/components/student-delete-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (!admin) return { title: "الطالب" };
  const { data } = await admin.from("students").select("name").eq("id", id).maybeSingle();
  return { title: `${data?.name ?? "الطالب"} | أقرأ` };
}

export default async function AdminStudentProfilePage({ params }: PageProps) {
  await requireRole("admin");
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  if (!admin) return notFound();

  const { data: student } = await admin
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!student) return notFound();

  const { data: activeAssignments } = await admin
    .from("teacher_student_assignments")
    .select("id, teacher_id, start_date, users!teacher_student_assignments_teacher_id_fkey(id, name)")
    .eq("student_id", id)
    .is("end_date", null);

  const { data: initialMem } = await admin
    .from("initial_memorization")
    .select("juz_number, status, sheikh_name")
    .eq("student_id", id)
    .order("juz_number");

  const { data: assignmentHistory } = await admin
    .from("teacher_student_assignments")
    .select("id, teacher_id, start_date, end_date, users!teacher_student_assignments_teacher_id_fkey(id, name)")
    .eq("student_id", id)
    .order("start_date", { ascending: false });

  const initMemValue = (initialMem ?? []).map((r) => ({
    juz_number: r.juz_number,
    status: r.status as "memorized" | "with_ijaza",
    sheikh_name: r.sheikh_name ?? undefined,
  }));

  const historyValue = (assignmentHistory ?? []).map((a) => {
    const u = a.users as unknown as { id: string; name: string } | null;
    return {
      id: a.id,
      teacher_id: a.teacher_id,
      teacher_name: u?.name ?? "",
      start_date: a.start_date,
      end_date: a.end_date,
      is_active: a.end_date === null,
    };
  });

  const age = student.birth_date
    ? Math.floor((Date.now() - new Date(student.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/students" className="btn-secondary px-2 py-1.5 text-xs">
            <ArrowRight className="size-4" />
          </Link>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {student.name}
              <GenderBadge value={student.gender as "male" | "female"} />
            </h2>
            <p className="text-sm text-muted-foreground">
              {student.is_active ? "نشط" : "غير نشط"}
              {age ? ` · ${age} سنة` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/ijazat?grant_for=${id}`} className="btn-primary gap-1.5 text-sm">
            <Award className="size-4" />
            منح إجازة
          </Link>
          <Link href={`/admin/students/${id}/edit`} className="btn-secondary gap-1.5">
            <Pencil className="size-4" />
            تعديل
          </Link>
        </div>
      </div>

      {/* Profile grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Info */}
        <div className="card space-y-3">
          <h3 className="font-semibold border-b border-border pb-2">البيانات الأساسية</h3>
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
          <h3 className="font-semibold border-b border-border pb-2">ملخص التقدم</h3>
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
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
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
        <h3 className="font-semibold border-b border-border pb-2">
          المحفظون الحاليون ({activeAssignments?.length ?? 0})
        </h3>
        {!activeAssignments?.length ? (
          <p className="text-sm text-muted-foreground">لا يوجد محفظون مسندون حالياً</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeAssignments.map((a) => {
              const u = a.users as unknown as { id: string; name: string } | null;
              return u ? (
                <Link
                  key={a.id}
                  href={`/admin/teachers/${u.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-sm font-medium hover:bg-muted transition-colors"
                >
                  {u.name}
                </Link>
              ) : null;
            })}
          </div>
        )}
        <div className="pt-1">
          <Link href="/admin/assignments" className="text-xs text-primary hover:underline">
            إدارة الإسناد ←
          </Link>
        </div>
      </div>

      <StudentProfileTabs
        studentId={id}
        initMemValue={initMemValue}
        assignmentHistory={historyValue}
        showAssignmentsTab
        isAdmin
      />

      {/* Admin-only: deactivate / permanent delete */}
      <div className="card space-y-4">
        <h3 className="font-semibold border-b border-border pb-2">إدارة الطالب</h3>
        <StudentDeleteButton
          studentId={id}
          studentName={student.name}
          isActive={student.is_active}
          redirectHref="/admin/students"
        />
      </div>
    </div>
  );
}
