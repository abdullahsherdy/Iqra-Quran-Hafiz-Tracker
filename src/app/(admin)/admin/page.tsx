import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import {
  studentsTable,
  usersTable,
  sessionsTable,
  ijazatTable,
} from "@/db/schema";
import { and, count, eq, gte, isNull, lt, or, desc } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen, Award,
  AlertTriangle, ClipboardList, Plus,
} from "lucide-react";
import { GenderBadge } from "@/components/badges";
import { toDateString } from "@/lib/utils";

export async function generateMetadata() {
  return { title: `لوحة التحكم | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function AdminDashboardPage() {
  await requireRole("admin");

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

  const [
    activeStudentsRows,
    teachersRows,
    sessionsTodayRows,
    sessionsWeekRows,
    recentSessions,
    recentIjazat,
    atRisk,
  ] = await Promise.all([
    db.select({ count: count() }).from(studentsTable).where(eq(studentsTable.status, "active")),
    db.select({ count: count() }).from(usersTable).where(and(eq(usersTable.role, "teacher"), eq(usersTable.is_active, true))),
    db.select({ count: count() }).from(sessionsTable).where(eq(sessionsTable.session_date, todayStr)),
    db.select({ count: count() }).from(sessionsTable).where(gte(sessionsTable.session_date, weekStartStr)),
    db.select({
        id: sessionsTable.id,
        session_date: sessionsTable.session_date,
        session_type: sessionsTable.session_type,
        rating: sessionsTable.rating,
        student_id: studentsTable.id,
        student_name: studentsTable.name,
        teacher_name: usersTable.name,
      })
      .from(sessionsTable)
      .leftJoin(studentsTable, eq(sessionsTable.student_id, studentsTable.id))
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .orderBy(desc(sessionsTable.session_date), desc(sessionsTable.created_at))
      .limit(6),
    db.select({
        id: ijazatTable.id,
        ijaza_date: ijazatTable.ijaza_date,
        ijaza_type: ijazatTable.ijaza_type,
        juz_number: ijazatTable.juz_number,
        student_id: studentsTable.id,
        student_name: studentsTable.name,
      })
      .from(ijazatTable)
      .leftJoin(studentsTable, eq(ijazatTable.student_id, studentsTable.id))
      .orderBy(desc(ijazatTable.ijaza_date), desc(ijazatTable.created_at))
      .limit(4),
    db.select({
        id: studentsTable.id,
        name: studentsTable.name,
        gender: studentsTable.gender,
        status: studentsTable.status,
        last_session_date: studentsTable.last_session_date,
      })
      .from(studentsTable)
      .where(and(
        eq(studentsTable.status, "active"),
        or(isNull(studentsTable.last_session_date), lt(studentsTable.last_session_date, thirtyDaysAgoStr)),
      ))
      .orderBy(studentsTable.last_session_date)
      .limit(5),
  ]);

  const activeStudents = activeStudentsRows[0]?.count ?? 0;
  const teachersCount  = teachersRows[0]?.count ?? 0;
  const sessionsToday  = sessionsTodayRows[0]?.count ?? 0;
  const sessionsWeek   = sessionsWeekRows[0]?.count ?? 0;

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
        <h2 className="text-xl font-bold">لوحة التحكم</h2>
        <p className="text-sm text-muted-foreground">
          {now.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/admin/students" className="card text-center space-y-1 hover:bg-secondary/60 transition-colors">
          <p className="text-3xl font-bold text-primary">{activeStudents}</p>
          <p className="text-xs text-muted-foreground">طالب نشط</p>
        </Link>
        <Link href="/admin/teachers" className="card text-center space-y-1 hover:bg-secondary/60 transition-colors">
          <p className="text-3xl font-bold text-[#1e40af]">{teachersCount}</p>
          <p className="text-xs text-muted-foreground">محفظ نشط</p>
        </Link>
        <div className="card text-center space-y-1">
          <p className="text-3xl font-bold text-[#854d0e]">{sessionsToday}</p>
          <p className="text-xs text-muted-foreground">جلسة اليوم</p>
        </div>
        <div className="card text-center space-y-1">
          <p className="text-3xl font-bold text-[#854d0e]">{sessionsWeek}</p>
          <p className="text-xs text-muted-foreground">جلسة هذا الأسبوع</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/students/new" className="btn-primary gap-1.5 text-sm">
          <Plus className="size-4" />
          طالب جديد
        </Link>
        <Link href="/admin/teachers/new" className="btn-secondary gap-1.5 text-sm">
          <Plus className="size-4" />
          محفظ جديد
        </Link>
        <Link href="/admin/assignments" className="btn-secondary gap-1.5 text-sm">
          <ClipboardList className="size-4" />
          إسناد الطلاب
        </Link>
        <Link href="/admin/ijazat" className="btn-secondary gap-1.5 text-sm">
          <Award className="size-4" />
          منح إجازة
        </Link>
      </div>

      {/* Main grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent sessions */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              <h3 className="font-semibold">آخر الجلسات</h3>
            </div>
          </div>
          {recentSessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد جلسات بعد</p>
          ) : (
            <ul className="space-y-2.5">
              {recentSessions.map((s) => {
                return (
                  <li key={s.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      {s.student_id ? (
                        <Link href={`/admin/students/${s.student_id}`} className="font-medium text-primary hover:underline truncate block">
                          {s.student_name}
                        </Link>
                      ) : null}
                      <p className="text-xs text-muted-foreground truncate">
                        {s.teacher_name} · {sessionTypeLabel[s.session_type] ?? s.session_type}
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

        {/* At risk + recent ijazat */}
        <div className="space-y-4">
          {/* At risk */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <AlertTriangle className="size-4 text-[#d97706]" />
              <h3 className="font-semibold">بحاجة متابعة</h3>
              <span className="text-xs text-muted-foreground">(+30 يوم)</span>
              {atRisk.length > 0 && (
                <span className="mr-auto text-xs font-bold text-[#dc2626]">{atRisk.length}</span>
              )}
            </div>
            {atRisk.length === 0 ? (
              <p className="py-3 text-center text-sm text-[#16a34a]">جميع الطلاب نشطون ✓</p>
            ) : (
              <ul className="space-y-2">
                {atRisk.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <Link href={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline flex items-center gap-1.5">
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
            )}
            {atRisk.length > 0 && (
              <Link href="/admin/reports" className="text-xs text-primary hover:underline">
                عرض الكل في التقارير ←
              </Link>
            )}
          </div>

          {/* Recent ijazat */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Award className="size-4 text-[#ca8a04]" />
              <h3 className="font-semibold">آخر الإجازات</h3>
            </div>
            {recentIjazat.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">لا توجد إجازات بعد</p>
            ) : (
              <ul className="space-y-2">
                {recentIjazat.map((ij) => {
                  return (
                    <li key={ij.id} className="flex items-center justify-between text-sm">
                      {ij.student_id ? (
                        <Link href={`/admin/students/${ij.student_id}`} className="font-medium text-primary hover:underline">
                          {ij.student_name}
                        </Link>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {ij.ijaza_type === "full_quran"
                          ? "القرآن كاملاً"
                          : `جزء ${ij.juz_number}`}
                        {" · "}
                        {new Date(ij.ijaza_date).toLocaleDateString("ar-EG")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
