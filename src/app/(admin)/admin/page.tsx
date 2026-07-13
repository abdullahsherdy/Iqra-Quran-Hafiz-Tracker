import { requireRole } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Users, GraduationCap, BookOpen, Award,
  AlertTriangle, ClipboardList, Plus,
} from "lucide-react";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";

export async function generateMetadata() {
  return { title: `لوحة التحكم | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function AdminDashboardPage() {
  const user = await requireRole("admin");

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

  const [
    activeStudentsRes,
    teachersRes,
    sessionsTodayRes,
    sessionsWeekRes,
    recentSessionsRes,
    recentIjazatRes,
    atRiskRes,
    unassignedRes,
  ] = await Promise.all([
    admin.from("students").select("*", { count: "exact", head: true }).eq("status", "active"),
    admin.from("users").select("*", { count: "exact", head: true }).eq("role", "teacher").eq("is_active", true),
    admin.from("sessions").select("*", { count: "exact", head: true }).eq("session_date", todayStr),
    admin.from("sessions").select("*", { count: "exact", head: true }).gte("session_date", weekStartStr),
    admin
      .from("sessions")
      .select("id, session_date, session_type, rating, students(id, name), users!sessions_teacher_id_fkey(name)")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
    admin
      .from("ijazat")
      .select("id, ijaza_date, ijaza_type, juz_number, students(id, name), users!ijazat_granted_by_fkey(name)")
      .order("ijaza_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4),
    admin
      .from("students")
      .select("id, name, gender, status, last_session_date")
      .eq("status", "active")
      .or(`last_session_date.is.null,last_session_date.lt.${thirtyDaysAgoStr}`)
      .order("last_session_date", { ascending: true })
      .limit(5),
    admin
      .from("students")
      .select("id, students:teacher_student_assignments!inner(student_id)", { count: "exact", head: true })
      .is("teacher_student_assignments.end_date", null)
      .neq("status", "withdrawn"),
  ]);

  const activeStudents = activeStudentsRes.count ?? 0;
  const teachersCount  = teachersRes.count ?? 0;
  const sessionsToday  = sessionsTodayRes.count ?? 0;
  const sessionsWeek   = sessionsWeekRes.count ?? 0;
  const recentSessions = recentSessionsRes.data ?? [];
  const recentIjazat   = recentIjazatRes.data ?? [];
  const atRisk         = atRiskRes.data ?? [];

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
                const student = s.students as unknown as { id: string; name: string } | null;
                const teacher = s.users as unknown as { name: string } | null;
                return (
                  <li key={s.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      {student ? (
                        <Link href={`/admin/students/${student.id}`} className="font-medium text-primary hover:underline truncate block">
                          {student.name}
                        </Link>
                      ) : null}
                      <p className="text-xs text-muted-foreground truncate">
                        {teacher?.name} · {sessionTypeLabel[s.session_type] ?? s.session_type}
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
                  const student = ij.students as unknown as { id: string; name: string } | null;
                  return (
                    <li key={ij.id} className="flex items-center justify-between text-sm">
                      {student ? (
                        <Link href={`/admin/students/${student.id}`} className="font-medium text-primary hover:underline">
                          {student.name}
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
