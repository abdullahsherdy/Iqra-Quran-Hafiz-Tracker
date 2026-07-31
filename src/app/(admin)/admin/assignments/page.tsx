import { requireRole } from "@/features/auth/session";
import { getDb } from "@/db/client";
import { studentsTable, usersTable, teacherStudentAssignmentsTable } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AssignmentsClient } from "./assignments-client";

export const metadata = { title: "إسناد الطلاب | اقرأ" };

export default async function AdminAssignmentsPage() {
  await requireRole("admin");

  const db = getDb();
  if (!db) return notFound();

  // Fetch all active teachers
  const teacherRows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      gender: usersTable.gender,
      can_view_all_genders: usersTable.can_view_all_genders,
    })
    .from(usersTable)
    .where(and(eq(usersTable.role, "teacher"), eq(usersTable.is_active, true)))
    .orderBy(asc(usersTable.name));

  const teachers = teacherRows.map((t) => ({
    id: t.id,
    name: t.name,
    gender: t.gender ?? "",
    can_view_all_genders: t.can_view_all_genders ?? false,
  }));

  // Fetch all active students
  const students = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
      gender: studentsTable.gender,
      memorized_juz_count: studentsTable.memorized_juz_count,
      status: studentsTable.status,
    })
    .from(studentsTable)
    .where(eq(studentsTable.status, "active"))
    .orderBy(asc(studentsTable.name));

  // Fetch all active assignments with teacher info
  const activeAssignments = await db
    .select({
      id: teacherStudentAssignmentsTable.id,
      teacher_id: teacherStudentAssignmentsTable.teacher_id,
      student_id: teacherStudentAssignmentsTable.student_id,
      start_date: teacherStudentAssignmentsTable.start_date,
      teacher_name: usersTable.name,
    })
    .from(teacherStudentAssignmentsTable)
    .leftJoin(usersTable, eq(teacherStudentAssignmentsTable.teacher_id, usersTable.id))
    .where(isNull(teacherStudentAssignmentsTable.end_date));

  // Group assignments by student
  const studentAssignments: Record<string, Array<{ id: string; teacher_id: string; name: string; start_date: string }>> = {};
  for (const a of activeAssignments) {
    if (!studentAssignments[a.student_id]) {
      studentAssignments[a.student_id] = [];
    }
    studentAssignments[a.student_id].push({
      id: a.id,
      teacher_id: a.teacher_id,
      name: a.teacher_name ?? "",
      start_date: a.start_date,
    });
  }

  const enrichedStudents = students.map((s) => ({
    ...s,
    assignments: studentAssignments[s.id] ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">إسناد الطلاب</h2>
        <p className="text-sm text-muted-foreground">
          إدارة إسناد الطلاب للمحفظين. يمكن إسناد الطالب لأكثر من محفظ في نفس الوقت.
        </p>
      </div>

      <AssignmentsClient
        students={enrichedStudents}
        teachers={teachers}
      />
    </div>
  );
}
