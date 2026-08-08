import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { studentsTable, usersTable } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { GrantIjazaForm } from "@/features/ijazat/components/grant-ijaza-form";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "منح إجازة | اقرأ" };

interface PageProps {
  searchParams: Promise<{ student_id?: string }>;
}

export default async function TeacherGrantIjazaPage({ searchParams }: PageProps) {
  const user = await requireRole("teacher");
  const { student_id: preselectedId } = await searchParams;

  const db = getDb();
  if (!db) {
    return <div className="text-destructive p-4">خطأ في الاتصال بالخادم</div>;
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

  const students = await db
    .select({ id: studentsTable.id, name: studentsTable.name })
    .from(studentsTable)
    .where(and(...conditions))
    .orderBy(asc(studentsTable.name));

  return (
    <div className="space-y-6 mx-auto max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/teacher/students" className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">منح إجازة</h2>
          <p className="text-sm text-muted-foreground">
            تسجيل إجازة لأحد طلابك
          </p>
        </div>
      </div>

      {students.length > 0 ? (
        <GrantIjazaForm
          students={students}
          preselectedStudentId={preselectedId}
          redirectTo={
            preselectedId
              ? `/teacher/students/${preselectedId}`
              : "/teacher/students"
          }
        />
      ) : (
        <div className="card text-center py-12 text-sm text-muted-foreground">
          <p>لا يوجد طلاب نشطون متاحون لك حالياً.</p>
        </div>
      )}
    </div>
  );
}
