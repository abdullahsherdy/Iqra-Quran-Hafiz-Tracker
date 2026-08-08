import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { studentsTable, surahsTable, usersTable } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { SessionForm } from "@/features/sessions/components/session-form";

export const metadata = { title: "تسجيل جلسة | اقرأ" };

export default async function TeacherNewSessionPage() {
  const user = await requireRole("teacher");

  const db = getDb();
  if (!db) {
    return <div className="text-destructive">خطأ في الاتصال</div>;
  }

  const [teacherUser] = await db
    .select({
      gender: usersTable.gender,
      can_view_all_genders: usersTable.can_view_all_genders,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  // Gender-scoped active students (no assignment check)
  const conditions = [eq(studentsTable.status, "active")];
  if (teacherUser && !teacherUser.can_view_all_genders && teacherUser.gender) {
    conditions.push(eq(studentsTable.gender, teacherUser.gender));
  }

  const [students, surahs] = await Promise.all([
    db
      .select({ id: studentsTable.id, name: studentsTable.name })
      .from(studentsTable)
      .where(and(...conditions))
      .orderBy(asc(studentsTable.name)),
    db
      .select({
        id: surahsTable.id,
        name_arabic: surahsTable.name_arabic,
        total_ayahs: surahsTable.total_ayahs,
      })
      .from(surahsTable)
      .orderBy(asc(surahsTable.id)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">تسجيل جلسة</h2>
        <p className="text-sm text-muted-foreground">تسجيل جلسة حفظ أو مراجعة أو سماع</p>
      </div>

      <SessionForm
        students={students}
        surahs={surahs}
      />
    </div>
  );
}
