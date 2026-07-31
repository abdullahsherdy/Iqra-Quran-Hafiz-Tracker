import { NextRequest } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";

import { sanitizeError } from "@/lib/api-error";
import {
  studentsTable,
  teacherStudentAssignmentsTable,
  usersTable,
} from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";
import { todayDateString } from "@/lib/utils";

// GET /api/assignments — active assignments table (admin)
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  // Fetch all students (for admin to assign teachers to)
  const allStudents = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
      gender: studentsTable.gender,
      memorized_juz_count: studentsTable.memorized_juz_count,
      status: studentsTable.status,
    })
    .from(studentsTable)
    .orderBy(asc(studentsTable.name));

  // Fetch all active assignments grouped
  const allAssignments = await db
    .select({
      id: teacherStudentAssignmentsTable.id,
      teacher_id: teacherStudentAssignmentsTable.teacher_id,
      student_id: teacherStudentAssignmentsTable.student_id,
      start_date: teacherStudentAssignmentsTable.start_date,
      teacher_name: usersTable.name,
    })
    .from(teacherStudentAssignmentsTable)
    .leftJoin(
      usersTable,
      eq(teacherStudentAssignmentsTable.teacher_id, usersTable.id),
    )
    .where(isNull(teacherStudentAssignmentsTable.end_date));

  // Build map: student_id -> [teachers]
  const assignmentMap: Record<string, Array<{ id: string; teacher_id: string; teacher_name: string; start_date: string }>> = {};
  for (const a of allAssignments) {
    if (!assignmentMap[a.student_id]) assignmentMap[a.student_id] = [];
    assignmentMap[a.student_id].push({
      id: a.id,
      teacher_id: a.teacher_id,
      teacher_name: a.teacher_name ?? "",
      start_date: a.start_date,
    });
  }

  const result = allStudents.map((s) => ({
    ...s,
    teachers: assignmentMap[s.id] ?? [],
  }));

  return Response.json(result);
}

// POST /api/assignments — add a teacher to a student (admin only)
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { teacher_id, student_id } = body;
  if (!teacher_id || !student_id) {
    return Response.json({ error: "teacher_id and student_id required" }, { status: 400 });
  }

  // Gender guard: teacher gender must match student gender (unless can_view_all_genders)
  const [teacher] = await db
    .select({
      id: usersTable.id,
      gender: usersTable.gender,
      can_view_all_genders: usersTable.can_view_all_genders,
      is_active: usersTable.is_active,
    })
    .from(usersTable)
    .where(and(eq(usersTable.id, teacher_id), eq(usersTable.role, "teacher")))
    .limit(1);

  const [student] = await db
    .select({ id: studentsTable.id, gender: studentsTable.gender })
    .from(studentsTable)
    .where(eq(studentsTable.id, student_id))
    .limit(1);

  if (!teacher || !student) return Response.json({ error: "Teacher or student not found" }, { status: 404 });
  if (!teacher.is_active) return Response.json({ error: "Teacher is inactive" }, { status: 400 });

  if (!teacher.can_view_all_genders && teacher.gender !== student.gender) {
    return Response.json({ error: "Gender mismatch — teacher cannot be assigned to student of different gender" }, { status: 400 });
  }

  // Duplicate-active guard (unique index handles it at DB level, but give a friendly error)
  const [existing] = await db
    .select({ id: teacherStudentAssignmentsTable.id })
    .from(teacherStudentAssignmentsTable)
    .where(
      and(
        eq(teacherStudentAssignmentsTable.teacher_id, teacher_id),
        eq(teacherStudentAssignmentsTable.student_id, student_id),
        isNull(teacherStudentAssignmentsTable.end_date),
      ),
    )
    .limit(1);

  if (existing) {
    return Response.json({ error: "هذا المحفظ مسند لهذا الطالب بالفعل" }, { status: 409 });
  }

  try {
    const [data] = await db
      .insert(teacherStudentAssignmentsTable)
      .values({
        teacher_id,
        student_id,
        start_date: todayDateString(),
        created_by: appUser.id,
      })
      .returning();
    return Response.json(data, { status: 201 });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
