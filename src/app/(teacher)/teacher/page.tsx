import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, Award, AlertTriangle, Plus } from "lucide-react";
import { GenderBadge } from "@/components/badges";

export async function generateMetadata() {
  return { title: `لوحة المتابعة | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function TeacherDashboardPage() {
  const user = await requireRole("teacher");

  const admin = createSupabaseAdminClient();
  if (!admin) return notFound();

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  // My assigned students
  const { data: myAssignments } = await admin
    .from("teacher_student_assignments")
    .select("student_id")
    .eq("teacher_id", user.id)
    .is("end_date", null);

  const myStudentIds = (myAssignments ?? []).map((a) => a.student_id);

  const [
    sessionsTodayRes,
    sessionsWeekRes,
    recentSessionsRes,
    atRiskRes,
    myStudentsRes,
  ] = await Promise.all([
    admin
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("teacher_id", user.id)
      .eq("session_date", todayStr),
    admin
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("teacher_id", user.id)
      .gte("session_date", weekStartStr),
    admin
      .from("sessions")
      .select("id, session_date, session_type, rating, from_ayah, to_ayah, students(id, name, gender)")
      .eq("teacher_id", user.id)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
    myStudentIds.length > 0
      ? admin
          .from("students")
          .select("id, name, gender, last_session_date, memorized_juz_count")
          .in("id", myStudentIds)
          .eq("status", "active")
          .or(`last_session_date.is.null,last_session_date.lt.${thirtyDaysAgoStr}`)
          .order("last_session_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    myStudentIds.length > 0
      ? admin
          .from("students")
          .select("id, name, gender, memorized_juz_count, ijaza_juz_count, last_session_date")
          .in("id", myStudentIds)
          .eq("status", "active")
          .order("last_session_date", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  const sessionsToday  = sessionsTodayRes.count ?? 0;
  const sessionsWeek   = sessionsWeekRes.count ?? 0;
  const recentSessions = recentSessionsRes.data ?? [];
  const atRisk         = (atRiskRes.data ?? []) as Array<{ id: string; name: string; gender: string; last_session_date: string | null; memorized_juz_count: number }>;
  const myStudents     = (myStudentsRes.data ?? []) as Array<{ id: string; name: string; gender: string; memorized_juz_count: number; ijaza_juz_count: number; last_session_date: string | null }>;

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
                const student = s.students as unknown as { id: string; name: string; gender: string } | null;
                return (
                  <li key={s.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      {student ? (
                        <Link href={`/teacher/students/${student.id}`} className="font-medium text-primary hover:underline truncate block">
                          {student.name}
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
