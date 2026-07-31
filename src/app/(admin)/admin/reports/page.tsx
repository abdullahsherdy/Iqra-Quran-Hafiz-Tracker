import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { studentsTable, sessionsTable, ijazatTable, usersTable } from "@/db/schema";
import { and, count, desc, eq, gte, isNull, lt, or } from "drizzle-orm";
import { BarChart3, AlertTriangle, TrendingUp, BookOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GenderBadge, StudentStatusBadge, type StudentStatus } from "@/components/badges";
import { toDateString } from "@/lib/utils";

export async function generateMetadata() {
  return { title: `التقارير | ${process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ"}` };
}

export default async function AdminReportsPage() {
  await requireRole("admin");

  const db = getDb();
  if (!db) return notFound();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = toDateString(thirtyDaysAgo);

  const [
    activeRows,
    pausedRows,
    graduatedRows,
    withdrawnRows,
    sessionsMonthRows,
    ijazatMonthRows,
    teachersRows,
    topStudents,
    atRisk,
    teacherSessionsRows,
  ] = await Promise.all([
    db.select({ count: count() }).from(studentsTable).where(eq(studentsTable.status, "active")),
    db.select({ count: count() }).from(studentsTable).where(eq(studentsTable.status, "paused")),
    db.select({ count: count() }).from(studentsTable).where(eq(studentsTable.status, "graduated")),
    db.select({ count: count() }).from(studentsTable).where(eq(studentsTable.status, "withdrawn")),
    db.select({ count: count() }).from(sessionsTable).where(gte(sessionsTable.session_date, monthStart)),
    db.select({ count: count() }).from(ijazatTable).where(gte(ijazatTable.ijaza_date, monthStart)),
    db.select({ count: count() }).from(usersTable).where(and(eq(usersTable.role, "teacher"), eq(usersTable.is_active, true))),
    db
      .select({
        id: studentsTable.id,
        name: studentsTable.name,
        gender: studentsTable.gender,
        memorized_juz_count: studentsTable.memorized_juz_count,
        ijaza_juz_count: studentsTable.ijaza_juz_count,
        last_session_date: studentsTable.last_session_date,
      })
      .from(studentsTable)
      .where(eq(studentsTable.status, "active"))
      .orderBy(desc(studentsTable.memorized_juz_count))
      .limit(10),
    db
      .select({
        id: studentsTable.id,
        name: studentsTable.name,
        last_session_date: studentsTable.last_session_date,
      })
      .from(studentsTable)
      .where(and(
        eq(studentsTable.status, "active"),
        or(isNull(studentsTable.last_session_date), lt(studentsTable.last_session_date, thirtyDaysAgoStr)),
      ))
      .orderBy(studentsTable.last_session_date)
      .limit(10),
    db
      .select({
        teacher_id: sessionsTable.teacher_id,
        teacher_id_join: usersTable.id,
        teacher_name: usersTable.name,
      })
      .from(sessionsTable)
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .where(gte(sessionsTable.session_date, monthStart)),
  ]);

  const activeCount    = activeRows[0]?.count ?? 0;
  const pausedCount    = pausedRows[0]?.count ?? 0;
  const graduatedCount = graduatedRows[0]?.count ?? 0;
  const withdrawnCount = withdrawnRows[0]?.count ?? 0;
  const sessionsMonth  = sessionsMonthRows[0]?.count ?? 0;
  const ijazatMonth    = ijazatMonthRows[0]?.count ?? 0;
  const teachersCount  = teachersRows[0]?.count ?? 0;

  // Aggregate sessions per teacher in JS
  const teacherMap = new Map<string, { name: string; count: number }>();
  for (const s of teacherSessionsRows) {
    if (!s.teacher_id_join) continue;
    const entry = teacherMap.get(s.teacher_id_join);
    if (entry) entry.count++;
    else teacherMap.set(s.teacher_id_join, { name: s.teacher_name ?? "", count: 1 });
  }
  const teacherActivity = [...teacherMap.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count);

  const monthName = now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="size-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">التقارير</h2>
          <p className="text-sm text-muted-foreground">{monthName}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { value: activeCount,   label: "طالب نشط",         color: "text-primary" },
          { value: sessionsMonth, label: "جلسة هذا الشهر",   color: "text-[#854d0e]" },
          { value: teachersCount, label: "محفظ نشط",          color: "text-[#1e40af]" },
          { value: ijazatMonth,   label: "إجازة هذا الشهر",  color: "text-[#16a34a]" },
        ].map(({ value, label, color }) => (
          <div key={label} className="card text-center space-y-1">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown — clickable links to filtered student list */}
      <div className="card space-y-3">
        <h3 className="font-semibold border-b border-border pb-2">توزيع حالات الطلاب</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { status: "active"    as StudentStatus, count: activeCount },
              { status: "paused"    as StudentStatus, count: pausedCount },
              { status: "graduated" as StudentStatus, count: graduatedCount },
              { status: "withdrawn" as StudentStatus, count: withdrawnCount },
            ]
          ).map(({ status, count }) => (
            <Link
              key={status}
              href={`/admin/students?status=${status}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3 hover:bg-secondary/80 transition-colors"
            >
              <span className="text-2xl font-bold">{count}</span>
              <StudentStatusBadge value={status} />
            </Link>
          ))}
        </div>
      </div>

      {/* Top students + At-risk */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top by memorization */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <TrendingUp className="size-4 text-primary" />
            <h3 className="font-semibold">أكثر الطلاب حفظاً</h3>
          </div>
          {topStudents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد بيانات</p>
          ) : (
            <ol className="space-y-2">
              {topStudents.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-5 shrink-0 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="font-medium text-primary hover:underline truncate"
                    >
                      {s.name}
                    </Link>
                    <GenderBadge value={s.gender as "male" | "female"} />
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <span className="font-bold">{s.memorized_juz_count}</span>
                    <span className="text-muted-foreground">/30</span>
                    {s.ijaza_juz_count > 0 && (
                      <span className="text-[#16a34a] text-xs">({s.ijaza_juz_count}✓)</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* At risk */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <AlertTriangle className="size-4 text-[#d97706]" />
            <h3 className="font-semibold">بحاجة متابعة</h3>
            <span className="text-xs text-muted-foreground">(أكثر من 30 يوماً بلا جلسة)</span>
          </div>
          {atRisk.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#16a34a]">جميع الطلاب نشطون ✓</p>
          ) : (
            <ul className="space-y-2">
              {atRisk.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/admin/students/${s.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {s.last_session_date
                      ? new Date(s.last_session_date).toLocaleDateString("ar-EG")
                      : "لا توجد جلسات"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Teacher activity table */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <BookOpen className="size-4 text-primary" />
          <h3 className="font-semibold">نشاط المحفظين — {monthName}</h3>
        </div>
        {teacherActivity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            لا توجد جلسات مسجلة هذا الشهر
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-right">
                <th className="px-4 py-2 font-medium">المحفظ</th>
                <th className="px-4 py-2 font-medium">الجلسات</th>
                <th className="px-4 py-2 font-medium">النسبة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teacherActivity.map((t) => (
                <tr key={t.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/teachers/${t.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-bold">{t.count}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${sessionsMonth > 0 ? Math.round((t.count / sessionsMonth) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs text-muted-foreground">
                        {sessionsMonth > 0 ? Math.round((t.count / sessionsMonth) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
