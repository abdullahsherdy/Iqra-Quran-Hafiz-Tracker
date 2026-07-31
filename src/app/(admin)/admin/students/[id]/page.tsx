import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import {
  studentsTable,
  teacherStudentAssignmentsTable,
  usersTable,
  initialMemorizationTable,
} from "@/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Pencil, Award } from "lucide-react";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { LevelBadge } from "@/features/students/components/level-badge";
import { StudentProfileTabs } from "@/features/students/components/student-profile-tabs";
import { StudentDeleteButton } from "@/features/students/components/student-delete-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata() {
  return { title: `ملف الطالب | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function AdminStudentProfilePage({ params }: PageProps) {
  await requireRole("admin");
  const { id } = await params;

  const db = getDb();
  if (!db) return notFound();

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);

  if (!student) return notFound();

  const [activeAssignments, initialMem, assignmentHistory] = await Promise.all([
    db
      .select({
        id: teacherStudentAssignmentsTable.id,
        teacher_id: teacherStudentAssignmentsTable.teacher_id,
        start_date: teacherStudentAssignmentsTable.start_date,
        teacher_name: usersTable.name,
      })
      .from(teacherStudentAssignmentsTable)
      .leftJoin(usersTable, eq(teacherStudentAssignmentsTable.teacher_id, usersTable.id))
      .where(and(eq(teacherStudentAssignmentsTable.student_id, id), isNull(teacherStudentAssignmentsTable.end_date))),
    db
      .select({
        juz_number: initialMemorizationTable.juz_number,
        status: initialMemorizationTable.status,
        sheikh_name: initialMemorizationTable.sheikh_name,
      })
      .from(initialMemorizationTable)
      .where(eq(initialMemorizationTable.student_id, id))
      .orderBy(asc(initialMemorizationTable.juz_number)),
    db
      .select({
        id: teacherStudentAssignmentsTable.id,
        teacher_id: teacherStudentAssignmentsTable.teacher_id,
        start_date: teacherStudentAssignmentsTable.start_date,
        end_date: teacherStudentAssignmentsTable.end_date,
        teacher_name: usersTable.name,
      })
      .from(teacherStudentAssignmentsTable)
      .leftJoin(usersTable, eq(teacherStudentAssignmentsTable.teacher_id, usersTable.id))
      .where(eq(teacherStudentAssignmentsTable.student_id, id))
      .orderBy(desc(teacherStudentAssignmentsTable.start_date)),
  ]);

  const initMemValue = initialMem.map((r) => ({
    juz_number: r.juz_number,
    status: r.status as "memorized" | "with_ijaza",
    sheikh_name: r.sheikh_name ?? undefined,
  }));

  const historyValue = assignmentHistory.map((a) => ({
    id: a.id,
    teacher_id: a.teacher_id,
    teacher_name: a.teacher_name ?? "",
    start_date: a.start_date,
    end_date: a.end_date,
    is_active: a.end_date === null,
  }));

  const age = student.birth_date
    ? Math.floor((new Date().getTime() - new Date(student.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
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
              <StudentStatusBadge value={student.status as StudentStatus} />
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
          المحفظون الحاليون ({activeAssignments.length})
        </h3>
        {!activeAssignments.length ? (
          <p className="text-sm text-muted-foreground">لا يوجد محفظون مسندون حالياً</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeAssignments.map((a) => {
              return a.teacher_name ? (
                <Link
                  key={a.id}
                  href={`/admin/teachers/${a.teacher_id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3.5 py-3 hover:bg-secondary/80 transition-colors shadow-xs"
                >
                  <div className="size-2 rounded-full bg-primary shrink-0" />
                  <span className="font-semibold text-sm text-foreground">{a.teacher_name}</span>
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
        <h3 className="font-semibold border-b border-border pb-3 mb-1">إدارة الطالب</h3>
        <StudentDeleteButton
          studentId={id}
          studentName={student.name}
          status={student.status as StudentStatus}
          redirectHref="/admin/students"
        />
      </div>
    </div>
  );
}
