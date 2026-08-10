import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { usersTable, sessionsTable } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { GenderBadge } from "@/components/badges";
import { PlusCircle, Users } from "lucide-react";

export const metadata = { title: "المحفظون | اقرأ" };

export default async function AdminTeachersPage() {
  await requireRole("admin");

  const db = getDb();
  const teachers = db
    ? await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          username: usersTable.username,
          gender: usersTable.gender,
          phone: usersTable.phone,
          is_active: usersTable.is_active,
          can_view_all_genders: usersTable.can_view_all_genders,
          created_at: usersTable.created_at,
        })
        .from(usersTable)
        .where(eq(usersTable.role, "teacher"))
        .orderBy(asc(usersTable.name))
    : [];

  // Count distinct students per teacher (based on sessions recorded)
  const teacherIds = teachers.map((t) => t.id);
  const assignmentCounts: Record<string, number> = {};
  if (db && teacherIds.length > 0) {
    const counts = await db
      .select({ teacher_id: sessionsTable.teacher_id, student_id: sessionsTable.student_id })
      .from(sessionsTable)
      .where(inArray(sessionsTable.teacher_id, teacherIds))
      .groupBy(sessionsTable.teacher_id, sessionsTable.student_id);
    for (const row of counts) {
      assignmentCounts[row.teacher_id] = (assignmentCounts[row.teacher_id] ?? 0) + 1;
    }
  }

  const active = teachers.filter((t) => t.is_active);
  const inactive = teachers.filter((t) => !t.is_active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">المحفظون</h2>
          <p className="text-sm text-muted-foreground">
            {active.length} نشط · {inactive.length} غير نشط
          </p>
        </div>
        <Link href="/admin/teachers/new" className="btn-primary">
          <PlusCircle className="size-4" />
          إضافة محفظ
        </Link>
      </div>

      {teachers.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 py-16 text-center">
          <Users className="size-12 text-muted-foreground opacity-40" />
          <p className="font-medium text-muted-foreground">لا يوجد محفظون بعد</p>
          <Link href="/admin/teachers/new" className="btn-primary">
            إضافة أول محفظ
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop/tablet: table view */}
          <div className="hidden sm:block card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-right">
                  <th className="px-4 py-3 font-medium">الاسم</th>
                  <th className="px-4 py-3 font-medium">اسم المستخدم</th>
                  <th className="px-4 py-3 font-medium">الجنس</th>
                  <th className="px-4 py-3 font-medium">الهاتف</th>
                  <th className="px-4 py-3 font-medium text-center">عدد الطلاب</th>
                  <th className="px-4 py-3 font-medium text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-secondary/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/teachers/${t.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {t.name}
                      </Link>
                      {t.can_view_all_genders && (
                        <span className="mr-2 text-xs text-muted-foreground">(رؤية الجنسين)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.username}</td>
                    <td className="px-4 py-3">
                      {t.gender ? (
                        <GenderBadge value={t.gender as "male" | "female"} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {t.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-secondary font-medium">
                        {assignmentCounts[t.id] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${t.is_active
                            ? "bg-[#dcfce7] text-[#166534]"
                            : "bg-[#fee2e2] text-[#991b1b]"
                          }`}
                      >
                        {t.is_active ? "نشط" : "غير نشط"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card view */}
          <div className="sm:hidden space-y-3">
            {teachers.map((t) => (
              <Link
                key={t.id}
                href={`/admin/teachers/${t.id}`}
                className="card space-y-2.5 hover:bg-secondary/40 transition-colors block"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-primary block truncate">{t.name}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">@{t.username}</span>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${t.is_active
                        ? "bg-[#dcfce7] text-[#166534]"
                        : "bg-[#fee2e2] text-[#991b1b]"
                      }`}
                  >
                    {t.is_active ? "نشط" : "غير نشط"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {t.gender && <GenderBadge value={t.gender as "male" | "female"} />}
                  {t.phone && (
                    <span className="text-muted-foreground" dir="ltr">{t.phone}</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium">
                    {assignmentCounts[t.id] ?? 0} طالب
                  </span>
                  {t.can_view_all_genders && (
                    <span className="text-muted-foreground">(رؤية الجنسين)</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
