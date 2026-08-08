import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { usersTable, sessionsTable, studentsTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
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

  // Students this teacher has recorded sessions with (distinct)
  const sessionStudents = await db
    .select({
      student_id: studentsTable.id,
      student_name: studentsTable.name,
      student_gender: studentsTable.gender,
      student_memorized_juz_count: studentsTable.memorized_juz_count,
      student_status: studentsTable.status,
    })
    .from(sessionsTable)
    .leftJoin(studentsTable, eq(sessionsTable.student_id, studentsTable.id))
    .where(eq(sessionsTable.teacher_id, id))
    .groupBy(studentsTable.id, studentsTable.name, studentsTable.gender, studentsTable.memorized_juz_count, studentsTable.status);

  const students = sessionStudents
    .filter((s) => s.student_id !== null)
    .map((s) => ({
      id: s.student_id!,
      name: s.student_name!,
      gender: s.student_gender!,
      memorized_juz_count: s.student_memorized_juz_count ?? 0,
      status: s.student_status,
      start_date: "",
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

      <TeacherProfileActions
        teacherId={teacher.id}
        teacherName={teacher.name}
        teacherUsername={teacher.username}
        teacherPhone={teacher.phone}
        teacherGender={teacher.gender}
        teacherCreatedAt={teacher.created_at ? teacher.created_at.toISOString() : null}
        isActive={teacher.is_active ?? true}
        canViewAllGenders={teacher.can_view_all_genders ?? false}
      />

      {/* Students with recorded sessions */}
      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold">الطلاب ({students.length})</h3>
        </div>
        {students.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            لا يوجد طلاب سجل هذا المحفظ جلسات لهم
          </p>
        ) : (
          <>
            {/* Desktop/tablet: table view */}
            <table className="hidden sm:table w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-right">
                  <th className="px-4 py-2.5 font-medium">الطالب</th>
                  <th className="px-4 py-2.5 font-medium">الجنس</th>
                  <th className="px-4 py-2.5 font-medium">المستوى</th>
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
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: card view */}
            <div className="sm:hidden divide-y divide-border">
              {students.map((s) => s && (
                <Link
                  key={s.id}
                  href={`/admin/students/${s.id}`}
                  className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-primary block truncate">{s.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <GenderBadge value={s.gender as "male" | "female"} />
                      <LevelBadge memorizedJuzCount={s.memorized_juz_count} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
