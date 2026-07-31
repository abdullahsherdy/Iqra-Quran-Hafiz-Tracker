import { NextRequest } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";

import { sanitizeError } from "@/lib/api-error";
import {
  studentsTable,
  teacherStudentAssignmentsTable,
  usersTable,
} from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/teachers/[id]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

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

  if (!teacher) return Response.json({ error: "Not found" }, { status: 404 });

  // Current assigned students
  const assignments = await db
    .select({
      student_id: teacherStudentAssignmentsTable.student_id,
      start_date: teacherStudentAssignmentsTable.start_date,
      student_id_2: studentsTable.id,
      student_name: studentsTable.name,
      student_gender: studentsTable.gender,
      student_memorized_juz_count: studentsTable.memorized_juz_count,
      student_status: studentsTable.status,
    })
    .from(teacherStudentAssignmentsTable)
    .leftJoin(
      studentsTable,
      eq(teacherStudentAssignmentsTable.student_id, studentsTable.id),
    )
    .where(
      and(
        eq(teacherStudentAssignmentsTable.teacher_id, id),
        isNull(teacherStudentAssignmentsTable.end_date),
      ),
    )
    .orderBy(asc(teacherStudentAssignmentsTable.start_date));

  const shapedAssignments = assignments.map((a) => ({
    student_id: a.student_id,
    start_date: a.start_date,
    students: {
      id: a.student_id_2,
      name: a.student_name,
      gender: a.student_gender,
      memorized_juz_count: a.student_memorized_juz_count,
      status: a.student_status,
    },
  }));

  return Response.json({ teacher, assignments: shapedAssignments });
}

// PUT /api/teachers/[id] — admin only; update is_active or can_view_all_genders
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const allowedFields = ["is_active", "can_view_all_genders", "name", "phone"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  try {
    const [data] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "teacher")))
      .returning();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
