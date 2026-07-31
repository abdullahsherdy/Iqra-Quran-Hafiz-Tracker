import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { sanitizeError } from "@/lib/api-error";
import { teacherStudentAssignmentsTable } from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";
import { todayDateString } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/assignments/[id]/end — set end_date = today (remove teacher from student)
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const today = todayDateString();

  try {
    const [data] = await db
      .update(teacherStudentAssignmentsTable)
      .set({ end_date: today })
      .where(
        and(
          eq(teacherStudentAssignmentsTable.id, id),
          isNull(teacherStudentAssignmentsTable.end_date),
        ),
      )
      .returning();

    if (!data) return Response.json({ error: "Assignment not found or already ended" }, { status: 404 });
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
