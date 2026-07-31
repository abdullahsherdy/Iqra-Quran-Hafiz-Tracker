import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { studentsTable, teacherStudentAssignmentsTable, usersTable } from "@/db/schema";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/assignments — full assignment history (admin only)
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const [student] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);
  if (!student) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const data = await db
      .select({
        id: teacherStudentAssignmentsTable.id,
        teacher_id: teacherStudentAssignmentsTable.teacher_id,
        start_date: teacherStudentAssignmentsTable.start_date,
        end_date: teacherStudentAssignmentsTable.end_date,
        teacher_name: usersTable.name,
      })
      .from(teacherStudentAssignmentsTable)
      .leftJoin(usersTable, eq(teacherStudentAssignmentsTable.teacher_id, usersTable.id))
      .where(eq(teacherStudentAssignmentsTable.student_id, id))
      .orderBy(desc(teacherStudentAssignmentsTable.start_date));

    const history = data.map((a) => ({
      id: a.id,
      teacher_id: a.teacher_id,
      teacher_name: a.teacher_name ?? "",
      start_date: a.start_date,
      end_date: a.end_date,
      is_active: a.end_date === null,
    }));

    return Response.json(history);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
