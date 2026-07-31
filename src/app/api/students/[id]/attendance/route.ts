import { NextRequest } from "next/server";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { attendanceTable, usersTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { sanitizeError } from "@/lib/api-error";
import { recalculateStudentAttendance } from "@/features/attendance/server/recalc";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/attendance — attendance history + stats
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
        notes: attendanceTable.notes,
        recorded_manually: attendanceTable.recorded_manually,
        teacher_id: attendanceTable.teacher_id,
        teacher_name: usersTable.name,
      })
      .from(attendanceTable)
      .leftJoin(usersTable, eq(attendanceTable.teacher_id, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(attendanceTable.attendance_date));

    const records = data.map((r) => ({
      id: r.id,
      attendance_date: r.attendance_date,
      status: r.status,
      notes: r.notes,
      recorded_manually: r.recorded_manually,
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name ?? "",
    }));

    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const excused = records.filter((r) => r.status === "excused").length;
    const holiday = records.filter((r) => r.status === "holiday").length;
    // Rate counts present against the "attended-or-missed" days (excludes excused/holiday).
    const counted = present + absent;
    const attendanceRate = counted > 0 ? Math.round((present / counted) * 100) : null;

    return Response.json({
      records,
      stats: { total, present, absent, excused, holiday, attendanceRate },
    });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "attendance fetch") }, { status: 500 });
  }
}

const MANUAL_STATUSES = ["present", "absent", "excused", "holiday"] as const;
type ManualStatus = (typeof MANUAL_STATUSES)[number];

// POST /api/students/[id]/attendance — manual attendance entry (C4).
// Records a manual attendance row (excused absence, holiday, manual present/absent).
// Manual rows are preserved by recalculateStudentAttendance and never overwritten
// by auto-derivation. Upserts on (student_id, attendance_date).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { attendance_date, status, notes } = body as {
    attendance_date?: string;
    status?: string;
    notes?: string | null;
  };

  if (!attendance_date || typeof attendance_date !== "string") {
    return Response.json({ error: "attendance_date مطلوب" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendance_date)) {
    return Response.json({ error: "صيغة التاريخ غير صحيحة (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!status || !MANUAL_STATUSES.includes(status as ManualStatus)) {
    return Response.json({ error: "status غير صالح" }, { status: 400 });
  }

  try {
    const [data] = await db
      .insert(attendanceTable)
      .values({
        student_id: studentId,
        teacher_id: appUser.id,
        attendance_date,
        status,
        notes: notes ?? null,
        recorded_manually: true,
      })
      .onConflictDoUpdate({
        target: [attendanceTable.student_id, attendanceTable.attendance_date],
        set: {
          status,
          notes: notes ?? null,
          teacher_id: appUser.id,
          recorded_manually: true,
        },
      })
      .returning();

    return Response.json(data, { status: 201 });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "attendance insert") }, { status: 500 });
  }
}

// DELETE /api/students/[id]/attendance — delete a manual attendance row.
// Only manual rows can be deleted via this endpoint; auto-derived rows are
// regenerated by recalculateStudentAttendance and should not be removed manually.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return Response.json({ error: "date param required" }, { status: 400 });

  try {
    await db
      .delete(attendanceTable)
      .where(
        and(
          eq(attendanceTable.student_id, studentId),
          eq(attendanceTable.attendance_date, date),
          eq(attendanceTable.recorded_manually, true),
        ),
      );

    // Re-derive the auto row for this date (in case a session exists that day).
    await recalculateStudentAttendance(db, studentId, { affectedDate: date });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "attendance delete") }, { status: 500 });
  }
}
