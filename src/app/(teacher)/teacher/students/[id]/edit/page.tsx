import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import {
  studentsTable,
  teacherStudentAssignmentsTable,
  usersTable,
  initialMemorizationTable,
} from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EditStudentForm } from "@/app/(admin)/admin/students/[id]/edit/edit-student-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const db = getDb();
  if (!db) return { title: "تعديل الطالب" };
  const [data] = await db
    .select({ name: studentsTable.name })
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);
  return { title: `تعديل: ${data?.name ?? "الطالب"} | اقرأ` };
}

export default async function TeacherEditStudentPage({ params }: PageProps) {
  const user = await requireRole("teacher");
  const { id } = await params;

  const db = getDb();
  if (!db) return notFound();

  // Fetch student
  const [student] = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
      gender: studentsTable.gender,
      birth_date: studentsTable.birth_date,
      guardian_name: studentsTable.guardian_name,
      guardian_phone: studentsTable.guardian_phone,
      enrollment_date: studentsTable.enrollment_date,
      notes: studentsTable.notes,
      status: studentsTable.status,
      memorized_juz_count: studentsTable.memorized_juz_count,
    })
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);

  if (!student) return notFound();

  // Enforce assignment scoping
  const [assign] = await db
    .select({ id: teacherStudentAssignmentsTable.id })
    .from(teacherStudentAssignmentsTable)
    .where(
      and(
        eq(teacherStudentAssignmentsTable.teacher_id, user.id),
        eq(teacherStudentAssignmentsTable.student_id, id),
        isNull(teacherStudentAssignmentsTable.end_date),
      ),
    )
    .limit(1);

  if (!assign) return notFound();

  // Enforce gender scoping
  const [teacherUser] = await db
    .select({
      gender: usersTable.gender,
      can_view_all_genders: usersTable.can_view_all_genders,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  if (!teacherUser) return notFound();
  if (!teacherUser.can_view_all_genders && student.gender !== teacherUser.gender) {
    return notFound();
  }

  const initMem = await db
    .select({
      juz_number: initialMemorizationTable.juz_number,
      status: initialMemorizationTable.status,
      sheikh_name: initialMemorizationTable.sheikh_name,
    })
    .from(initialMemorizationTable)
    .where(eq(initialMemorizationTable.student_id, id))
    .orderBy(asc(initialMemorizationTable.juz_number));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/teacher/students/${id}`} className="btn-secondary px-2 py-1.5 text-xs">
          <ArrowRight className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">تعديل بيانات الطالب</h2>
          <p className="text-sm text-muted-foreground">{student.name}</p>
        </div>
      </div>

      <EditStudentForm
        student={student}
        initialMem={initMem.map((r) => ({
          juz_number: r.juz_number,
          status: r.status as "memorized" | "with_ijaza",
          sheikh_name: r.sheikh_name ?? undefined,
        }))}
        redirectBase={`/teacher/students/${id}`}
        mode="teacher"
      />
    </div>
  );
}
