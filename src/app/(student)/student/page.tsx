import { eq } from "drizzle-orm";
import {
  BookMarked,
  Award,
  CalendarCheck,
  CalendarDays,
  Map as MapIcon,
  RotateCcw,
  History,
  UserCircle,
} from "lucide-react";

import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { studentsTable, attendanceTable } from "@/db/schema";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { LevelBadge } from "@/features/students/components/level-badge";
import { ProgressMap } from "@/features/students/components/progress-map";
import { ReviewCalendar } from "@/features/sessions/components/review-calendar";
import { PortalSessions } from "@/features/students/components/portal-sessions";
import { loadStudentSessions } from "@/features/students/server/sessions-read";
import { toArabicNumerals } from "@/lib/arabic";
import { todayDateString } from "@/lib/utils";

export async function generateMetadata() {
  return { title: `لوحتي | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function StudentDashboardPage() {
  const user = await requireRole("student");

  const db = getDb();
  if (!db) {
    return (
      <div className="card p-8 text-center text-sm text-muted-foreground">
        تعذّر الاتصال بقاعدة البيانات. يرجى المحاولة لاحقاً.
      </div>
    );
  }

  // Resolve the caller's OWN student record (never from a URL id).
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.user_id, user.id))
    .limit(1);

  if (!student) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="rounded-full bg-secondary/40 p-4">
            <UserCircle className="size-9 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold">لا يوجد سجل مرتبط بحسابك بعد</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            حسابك غير مرتبط بأي سجل طالب حتى الآن. يرجى التواصل مع إدارة الحلقة
            لربط حسابك بسجلك.
          </p>
        </div>
      </div>
    );
  }

  // Read-only reads for the dashboard, in parallel.
  const [attendanceRows, sessions] = await Promise.all([
    db
      .select({ attendance_date: attendanceTable.attendance_date })
      .from(attendanceTable)
      .where(eq(attendanceTable.student_id, student.id)),
    loadStudentSessions(db, student.id, { limit: 20 }),
  ]);

  // Attendance stats (present-only) — same logic as the staff attendance route.
  const attendanceTotal = attendanceRows.length;
  const today = todayDateString();
  const monthStart = today.substring(0, 7) + "-01";
  const attendanceThisMonth = attendanceRows.filter(
    (r) => r.attendance_date >= monthStart && r.attendance_date <= today
  ).length;

  const age = student.birth_date
    ? Math.floor(
        (new Date().getTime() - new Date(student.birth_date).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  const memorizedPercent = Math.round((student.memorized_juz_count / 30) * 100);

  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold truncate">
            أهلاً، {student.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <GenderBadge value={student.gender as "male" | "female"} />
            <StudentStatusBadge value={student.status as StudentStatus} />
            {age ? (
              <span className="text-sm text-muted-foreground">
                {toArabicNumerals(age)} سنة
              </span>
            ) : null}
          </div>
        </div>
        <LevelBadge memorizedJuzCount={student.memorized_juz_count} className="self-start" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={BookMarked}
          label="الأجزاء المحفوظة"
          value={`${toArabicNumerals(student.memorized_juz_count)} / ${toArabicNumerals(30)}`}
          accent="text-primary"
        />
        <StatCard
          icon={Award}
          label="الإجازات"
          value={toArabicNumerals(student.ijaza_juz_count)}
          accent="text-[#16a34a]"
        />
        <StatCard
          icon={CalendarCheck}
          label="أيام الحضور"
          value={toArabicNumerals(attendanceTotal)}
          accent="text-[#2563eb]"
        />
        <StatCard
          icon={CalendarDays}
          label="حضور هذا الشهر"
          value={toArabicNumerals(attendanceThisMonth)}
          accent="text-[#ca8a04]"
        />
      </div>

      {/* Overall progress bar */}
      <div className="card space-y-2 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">نسبة الحفظ الإجمالية</span>
          <span className="text-muted-foreground">
            {toArabicNumerals(memorizedPercent)}%
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-emerald-950/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${memorizedPercent}%` }}
          />
        </div>
      </div>

      {/* Progress map */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <MapIcon className="size-5 text-primary" />
          خريطة التقدم
        </h3>
        <div className="card p-4">
          <ProgressMap studentId={student.id} basePath="/api/student" />
        </div>
      </section>

      {/* Scheduled review */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <RotateCcw className="size-5 text-primary" />
          المراجعة المجدولة
        </h3>
        <div className="card p-4">
          <ReviewCalendar studentId={student.id} basePath="/api/student" />
        </div>
      </section>

      {/* Session history (read-only) */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <History className="size-5 text-primary" />
          سجل الجلسات
        </h3>
        <PortalSessions sessions={sessions} />
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof BookMarked;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="card flex flex-col gap-1.5 p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-4 ${accent}`} />
        <span>{label}</span>
      </div>
      <span className={`text-xl font-bold ${accent}`}>{value}</span>
    </div>
  );
}
