import { NextRequest } from "next/server";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { attendanceTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";
import { todayDateString } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/attendance — attendance history (present days only) + stats
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  const conditions = [eq(attendanceTable.student_id, studentId)];
  if (dateFrom) conditions.push(gte(attendanceTable.attendance_date, dateFrom));
  if (dateTo) conditions.push(lte(attendanceTable.attendance_date, dateTo));

  try {
    const data = await db
      .select({
        id: attendanceTable.id,
        attendance_date: attendanceTable.attendance_date,
        status: attendanceTable.status,
      })
      .from(attendanceTable)
      .where(and(...conditions))
      .orderBy(desc(attendanceTable.attendance_date));

    const records = data.map((r) => ({
      id: r.id,
      attendance_date: r.attendance_date,
      status: r.status,
    }));

    // Stats: total attendance + attendance in current month
    const total = records.length;

    const today = todayDateString();
    const monthStart = today.substring(0, 7) + "-01";
    const thisMonth = records.filter((r) => r.attendance_date >= monthStart && r.attendance_date <= today).length;

    return Response.json({
      records,
      stats: { total, thisMonth },
    });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "attendance fetch") }, { status: 500 });
  }
}
