import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { usersTable, teacherStudentAssignmentsTable, studentsTable } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GenderBadge } from "@/components/badges";
import { LevelBadge } from "@/features/students/components/level-badge";
import { ArrowRight } from "lucide-react";
import { TeacherProfileActions } from "./teacher-profile-actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const db = getDb();
  if (!db) return { title: "المحفظ" };
  const [row] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return { title: `${row?.name ?? "المحفظ"} | اقرأ` };
}

export default async function TeacherProfilePage({ params }: PageProps) {
  await requireRole("admin");
  const { id } = await params;

  const db = getDb();
  if (!db) return notFound();

  const [teacher] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      phone: usersTable.phone,
      gender: usersTable.gender,
      can_view_all_genders: usersTable.can_view_all_genders,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "teacher")))
    .limit(1);

  if (!teacher) return notFound();

  const assignments = await db
    .select({
      assignment_id: teacherStudentAssignmentsTable.id,
      start_date: teacherStudentAssignmentsTable.start_date,
      student_id: studentsTable.id,
      student_name: studentsTable.name,
      student_gender: studentsTable.gender,
      student_memorized_juz_count: studentsTable.memorized_juz_count,
      student_status: studentsTable.status,
    })
    .from(teacherStudentAssignmentsTable)
    .leftJoin(studentsTable, eq(teacherStudentAssignmentsTable.student_id, studentsTable.id))
    .where(and(eq(teacherStudentAssignmentsTable.teacher_id, id), isNull(teacherStudentAssignmentsTable.end_date)))
    .orderBy(asc(teacherStudentAssignmentsTable.start_date));

  const students = assignments
    .filter((a) => a.student_id !== null)
    .map((a) => ({
      id: a.student_id!,
      name: a.student_name!,
      gender: a.student_gender!,
      memorized_juz_count: a.student_memorized_juz_count ?? 0,
      status: a.student_status,
      assignment_id: a.assignment_id,
      start_date: a.start_date,
    }));

  return (
    <div className="space-y-6">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link href="/admin/teachers" className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <h2 className="text-xl font-bold">{teacher.name}</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Info card */}
        <div className="card space-y-4">
          <h3 className="font-semibold">بيانات المحفظ</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الاسم</dt>
              <dd className="font-medium">{teacher.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">اسم المستخدم</dt>
              <dd dir="ltr">{teacher.username}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الجنس</dt>
              <dd>
                {teacher.gender ? (
                  <GenderBadge value={teacher.gender as "male" | "female"} />
                ) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الهاتف</dt>
              <dd dir="ltr">{teacher.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">تاريخ الإنشاء</dt>
              <dd>{teacher.created_at ? new Date(teacher.created_at).toLocaleDateString("ar-EG") : "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Controls */}
        <div className="card space-y-4">
          <h3 className="font-semibold">الإعدادات</h3>
          <TeacherProfileActions
            teacherId={teacher.id}
            isActive={teacher.is_active ?? true}
            canViewAllGenders={teacher.can_view_all_genders ?? false}
          />
        </div>
      </div>

      {/* Current students */}
      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold">الطلاب الحاليون ({students.length})</h3>
        </div>
        {students.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            لا يوجد طلاب مسندون لهذا المحفظ حالياً
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-right">
                <th className="px-4 py-2.5 font-medium">الطالب</th>
                <th className="px-4 py-2.5 font-medium">الجنس</th>
                <th className="px-4 py-2.5 font-medium">المستوى</th>
                <th className="px-4 py-2.5 font-medium">تاريخ الإسناد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => s && (
                <tr key={s.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <GenderBadge value={s.gender as "male" | "female"} />
                  </td>
                  <td className="px-4 py-2.5">
                    <LevelBadge memorizedJuzCount={s.memorized_juz_count} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(s.start_date).toLocaleDateString("ar-EG")}
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
