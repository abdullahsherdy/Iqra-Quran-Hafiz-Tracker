import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import {
  studentsTable,
  sessionsTable,
  teacherStudentAssignmentsTable,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BarChart3, AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { toDateString } from "@/lib/utils";

export async function generateMetadata() {
  return { title: `تقاريري | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function TeacherReportsPage() {
  const user = await requireRole("teacher");

  const db = getDb();
  if (!db) return notFound();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = toDateString(thirtyDaysAgo);

  // My active student assignments
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

  const monthName = now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  if (myStudentIds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="size-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">تقاريري</h2>
            <p className="text-sm text-muted-foreground">{monthName}</p>
          </div>
        </div>
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-muted-foreground">لا يوجد طلاب مسندون لك حالياً</p>
        </div>
      </div>
    );
  }

  const [myStudents, mySessions, atRisk] = await Promise.all([
    db
      .select({
        id: studentsTable.id,
        name: studentsTable.name,
        gender: studentsTable.gender,
        status: studentsTable.status,
        memorized_juz_count: studentsTable.memorized_juz_count,
        ijaza_juz_count: studentsTable.ijaza_juz_count,
        last_session_date: studentsTable.last_session_date,
      })
      .from(studentsTable)
      .where(inArray(studentsTable.id, myStudentIds))
      .orderBy(desc(studentsTable.memorized_juz_count)),
    db
      .select({ rating: sessionsTable.rating })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.teacher_id, user.id),
          gte(sessionsTable.session_date, monthStart),
        ),
      ),
    db
      .select({
        id: studentsTable.id,
        name: studentsTable.name,
        last_session_date: studentsTable.last_session_date,
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
      .orderBy(asc(studentsTable.last_session_date)),
  ]);

  const ratings = {
    excellent: mySessions.filter((s) => s.rating === "excellent").length,
    good:      mySessions.filter((s) => s.rating === "good").length,
    weak:      mySessions.filter((s) => s.rating === "weak").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="size-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">تقاريري</h2>
          <p className="text-sm text-muted-foreground">{monthName}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: myStudentIds.length, label: "طالب مسند",        color: "text-primary" },
          { value: mySessions.length,   label: "جلسة هذا الشهر",   color: "text-[#854d0e]" },
          { value: atRisk.length,       label: "بحاجة متابعة",      color: atRisk.length > 0 ? "text-[#dc2626]" : "text-[#16a34a]" },
        ].map(({ value, label, color }) => (
          <div key={label} className="card text-center space-y-1">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Session ratings */}
      {mySessions.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-semibold border-b border-border pb-2">
            تقييمات الجلسات — {monthName}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-[#dcfce7] p-4 text-center">
              <p className="text-2xl font-bold text-[#166534]">{ratings.excellent}</p>
              <p className="text-xs text-[#166534] mt-1">ممتاز</p>
            </div>
            <div className="rounded-lg bg-[#fef9c3] p-4 text-center">
              <p className="text-2xl font-bold text-[#854d0e]">{ratings.good}</p>
              <p className="text-xs text-[#854d0e] mt-1">جيد</p>
            </div>
            <div className="rounded-lg bg-[#fee2e2] p-4 text-center">
              <p className="text-2xl font-bold text-[#991b1b]">{ratings.weak}</p>
              <p className="text-xs text-[#991b1b] mt-1">ضعيف</p>
            </div>
          </div>
        </div>
      )}

      {/* At risk */}
      {atRisk.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <AlertTriangle className="size-4 text-[#d97706]" />
            <h3 className="font-semibold">بحاجة متابعة</h3>
            <span className="text-xs text-muted-foreground">(أكثر من 30 يوماً بلا جلسة)</span>
          </div>
          <ul className="space-y-2">
            {atRisk.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <Link
                  href={`/teacher/students/${s.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {s.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {s.last_session_date
                    ? `آخر جلسة: ${new Date(s.last_session_date).toLocaleDateString("ar-EG")}`
                    : "لا توجد جلسات"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* My students table */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <TrendingUp className="size-4 text-primary" />
          <h3 className="font-semibold">طلابي ({myStudents.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-right">
                <th className="px-4 py-2 font-medium">الطالب</th>
                <th className="px-4 py-2 font-medium">الحالة</th>
                <th className="px-4 py-2 font-medium">الأجزاء</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">آخر جلسة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {myStudents.map((s) => (
                <tr key={s.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/teacher/students/${s.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      <GenderBadge value={s.gender as "male" | "female"} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StudentStatusBadge value={s.status as StudentStatus} />
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-bold">{s.memorized_juz_count}</span>
                    <span className="text-muted-foreground">/30</span>
                    {s.ijaza_juz_count > 0 && (
                      <span className="text-[#16a34a] text-xs mr-1">({s.ijaza_juz_count}✓)</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">
                    {s.last_session_date
                      ? new Date(s.last_session_date).toLocaleDateString("ar-EG")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
