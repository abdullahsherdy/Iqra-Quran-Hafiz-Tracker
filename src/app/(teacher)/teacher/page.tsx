import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import {
  studentsTable,
  sessionsTable,
  teacherStudentAssignmentsTable,
} from "@/db/schema";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, Award, AlertTriangle, Plus } from "lucide-react";
import { GenderBadge } from "@/components/badges";
import { toDateString } from "@/lib/utils";

export async function generateMetadata() {
  return { title: `لوحة المتابعة | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function TeacherDashboardPage() {
  const user = await requireRole("teacher");

  const db = getDb();
  if (!db) return notFound();

  const now = new Date();
  const todayStr = toDateString(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const weekStartStr = toDateString(weekStart);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const thirtyDaysAgoStr = toDateString(thirtyDaysAgo);

  // My assigned students
  const myAssignments = await db
    .select({ student_id: teacherStudentAssignmentsTable.student_id })
    .from(teacherStudentAssignmentsTable)
    .where(
      and(
        eq(teacherStudentAssignmentsTable.teacher_id, user.id),
        isNull(teacherStudentAssignmentsTable.end_date),
      ),
    );

  const myStudentIds = myAssignments.map((a) => a.student_id);

  const emptyArray = [] as const;
  const [
    sessionsTodayRows,
    sessionsWeekRows,
    recentSessions,
    atRisk,
    myStudents,
  ] = await Promise.all([
    db
      .select({ c: count() })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.teacher_id, user.id),
          eq(sessionsTable.session_date, todayStr),
        ),
      ),
    db
      .select({ c: count() })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.teacher_id, user.id),
          gte(sessionsTable.session_date, weekStartStr),
        ),
      ),
    db
      .select({
        id: sessionsTable.id,
        session_date: sessionsTable.session_date,
        session_type: sessionsTable.session_type,
        rating: sessionsTable.rating,
        from_ayah: sessionsTable.from_ayah,
        to_ayah: sessionsTable.to_ayah,
        student_id: studentsTable.id,
        student_name: studentsTable.name,
        student_gender: studentsTable.gender,
      })
      .from(sessionsTable)
      .leftJoin(studentsTable, eq(sessionsTable.student_id, studentsTable.id))
      .where(eq(sessionsTable.teacher_id, user.id))
      .orderBy(desc(sessionsTable.session_date), desc(sessionsTable.created_at))
      .limit(6),
    myStudentIds.length > 0
      ? db
          .select({
            id: studentsTable.id,
            name: studentsTable.name,
            gender: studentsTable.gender,
            last_session_date: studentsTable.last_session_date,
            memorized_juz_count: studentsTable.memorized_juz_count,
          })
          .from(studentsTable)
          .where(
            and(
              inArray(studentsTable.id, myStudentIds),
              eq(studentsTable.status, "active"),
              or(
                isNull(studentsTable.last_session_date),
                lt(studentsTable.last_session_date, thirtyDaysAgoStr),
              ),
            ),
          )
          .orderBy(asc(studentsTable.last_session_date))
      : Promise.resolve(emptyArray),
    myStudentIds.length > 0
      ? db
          .select({
            id: studentsTable.id,
            name: studentsTable.name,
            gender: studentsTable.gender,
            memorized_juz_count: studentsTable.memorized_juz_count,
            ijaza_juz_count: studentsTable.ijaza_juz_count,
            last_session_date: studentsTable.last_session_date,
          })
          .from(studentsTable)
          .where(
            and(
              inArray(studentsTable.id, myStudentIds),
              eq(studentsTable.status, "active"),
            ),
          )
          .orderBy(desc(studentsTable.last_session_date))
          .limit(8)
      : Promise.resolve(emptyArray),
  ]);

  const sessionsToday  = sessionsTodayRows[0]?.c ?? 0;
  const sessionsWeek   = sessionsWeekRows[0]?.c ?? 0;

  const ratingColor: Record<string, string> = {
    excellent: "bg-[#dcfce7] text-[#166534]",
    good:      "bg-[#fef9c3] text-[#854d0e]",
    weak:      "bg-[#fee2e2] text-[#991b1b]",
  };
  const ratingLabel: Record<string, string> = {
    excellent: "ممتاز", good: "جيد", weak: "ضعيف",
  };
  const sessionTypeLabel: Record<string, string> = {
    new_memorization: "تسميع جديد", review: "مراجعة",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">مرحباً، {user.name}</h2>
        <p className="text-sm text-muted-foreground">
          {now.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center space-y-1">
          <p className="text-3xl font-bold text-primary">{myStudentIds.length}</p>
          <p className="text-xs text-muted-foreground">طالب مسند</p>
        </div>
        <div className="card text-center space-y-1">
          <p className="text-3xl font-bold text-[#854d0e]">{sessionsToday}</p>
          <p className="text-xs text-muted-foreground">جلسة اليوم</p>
        </div>
        <div className="card text-center space-y-1">
          <p className="text-3xl font-bold text-[#854d0e]">{sessionsWeek}</p>
          <p className="text-xs text-muted-foreground">جلسة الأسبوع</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link href="/teacher/session/new" className="btn-primary flex-1 justify-center gap-1.5 text-sm">
          <Plus className="size-4" />
          تسجيل جلسة
        </Link>
        <Link href="/teacher/ijazat/new" className="btn-secondary flex-1 justify-center gap-1.5 text-sm">
          <Award className="size-4" />
          منح إجازة
        </Link>
      </div>

      {/* At risk alert */}
      {atRisk.length > 0 && (
        <div className="card space-y-3 border-[#fde68a] bg-[#fffbeb]">
          <div className="flex items-center gap-2 border-b border-[#fde68a] pb-2">
            <AlertTriangle className="size-4 text-[#d97706]" />
            <h3 className="font-semibold text-[#92400e]">طلاب بحاجة متابعة</h3>
            <span className="mr-auto text-xs font-bold text-[#dc2626]">{atRisk.length} طالب</span>
          </div>
          <ul className="space-y-2">
            {atRisk.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <Link href={`/teacher/students/${s.id}`} className="font-medium text-primary hover:underline flex items-center gap-1.5">
                  {s.name}
                  <GenderBadge value={s.gender as "male" | "female"} />
                </Link>
                <span className="text-xs text-muted-foreground">
                  {s.last_session_date
                    ? new Date(s.last_session_date).toLocaleDateString("ar-EG")
                    : "لا جلسات"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent sessions */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <BookOpen className="size-4 text-primary" />
            <h3 className="font-semibold">آخر الجلسات</h3>
          </div>
          {recentSessions.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">لم تُسجَّل جلسات بعد</p>
              <Link href="/teacher/session/new" className="btn-primary text-sm">
                سجّل أول جلسة
              </Link>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {recentSessions.map((s) => {
                return (
                  <li key={s.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      {s.student_id ? (
                        <Link href={`/teacher/students/${s.student_id}`} className="font-medium text-primary hover:underline truncate block">
                          {s.student_name}
                        </Link>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {sessionTypeLabel[s.session_type] ?? s.session_type}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ratingColor[s.rating] ?? ""}`}>
                        {ratingLabel[s.rating] ?? s.rating}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(s.session_date).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* My students snapshot */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="font-semibold">طلابي</h3>
            <Link href="/teacher/students" className="text-xs text-primary hover:underline">
              عرض الكل ←
            </Link>
          </div>
          {myStudents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد طلاب مسندون</p>
          ) : (
            <ul className="space-y-2.5">
              {myStudents.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Link href={`/teacher/students/${s.id}`} className="font-medium text-primary hover:underline truncate">
                      {s.name}
                    </Link>
                    <GenderBadge value={s.gender as "male" | "female"} />
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{s.memorized_juz_count}<span className="font-normal text-muted-foreground">/30</span></span>
                    {s.last_session_date
                      ? new Date(s.last_session_date).toLocaleDateString("ar-EG")
                      : "لا جلسات"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
