import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import {
  studentsTable,
  sessionsTable,
  usersTable,
  initialMemorizationTable,
} from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Pencil, Award } from "lucide-react";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { formatWesternDate } from "@/lib/arabic";
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

  const [sessionTeachers, initialMem] = await Promise.all([
    db
      .select({
        teacher_id: sessionsTable.teacher_id,
        teacher_name: usersTable.name,
      })
      .from(sessionsTable)
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .where(eq(sessionsTable.student_id, id))
      .groupBy(sessionsTable.teacher_id, usersTable.name),
    db
      .select({
        juz_number: initialMemorizationTable.juz_number,
        status: initialMemorizationTable.status,
        sheikh_name: initialMemorizationTable.sheikh_name,
        pages: initialMemorizationTable.pages,
      })
      .from(initialMemorizationTable)
      .where(eq(initialMemorizationTable.student_id, id))
      .orderBy(asc(initialMemorizationTable.juz_number)),
  ]);

  const activeAssignments = sessionTeachers
    .filter((r) => r.teacher_name)
    .map((r, i) => ({
      id: `session-${r.teacher_id}-${i}`,
      teacher_id: r.teacher_id,
      start_date: "",
      teacher_name: r.teacher_name!,
    }));

  const initMemValue = initialMem.map((r) => ({
    juz_number: r.juz_number,
    status: r.status as "memorized" | "with_ijaza",
    sheikh_name: r.sheikh_name ?? undefined,
    pages: r.pages,
  }));

  const age = student.birth_date
    ? Math.floor((new Date().getTime() - new Date(student.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/students" className="btn-secondary px-2 py-1.5 text-xs shrink-0">
            <ArrowRight className="size-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <span className="truncate">{student.name}</span>
              <GenderBadge value={student.gender as "male" | "female"} />
            </h2>
            <p className="text-sm text-muted-foreground">
              <StudentStatusBadge value={student.status as StudentStatus} />
              {age ? ` · ${age} سنة` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/admin/ijazat?grant_for=${id}`} className="btn-primary gap-1.5 text-sm px-3 py-2">
            <Award className="size-4" />
            <span>منح إجازة</span>
          </Link>
          <Link href={`/admin/students/${id}/edit`} className="btn-secondary gap-1.5 px-3 py-2">
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
                <dd>{formatWesternDate(student.birth_date)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">تاريخ الانضمام</dt>
              <dd>{formatWesternDate(student.enrollment_date)}</dd>
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
                <span>{formatWesternDate(student.last_session_date)}</span>
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

      {/* Teachers who recorded sessions with this student */}
      <div className="card space-y-3">
        <h3 className="font-semibold border-b border-border pb-3 mb-1">
          المحفظون ({activeAssignments.length})
        </h3>
        {!activeAssignments.length ? (
          <p className="text-sm text-muted-foreground">لا يوجد محفظون سجلوا جلسات لهذا الطالب</p>
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
      </div>

      <StudentProfileTabs
        studentId={id}
        studentName={student.name}
        initMemValue={initMemValue}
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
