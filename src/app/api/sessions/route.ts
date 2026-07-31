import { NextRequest } from "next/server";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { sessionsTable, surahsTable, studentsTable } from "@/db/schema";
import { getAssignedStudentIds, canAccessStudent } from "@/features/auth/student-access";
import { validateSessionPayload } from "@/domain/sessions";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { recalculateStudentAttendance } from "@/features/attendance/server/recalc";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

// GET /api/sessions — role-scoped list
export async function GET(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id") ?? "";
  const sessionType = searchParams.get("session_type") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  const conditions = [];

  if (appUser.role === "teacher") {
    const ids = await getAssignedStudentIds(db, appUser.id);
    if (ids.length === 0) return Response.json([]);
    conditions.push(inArray(sessionsTable.student_id, ids));
    conditions.push(eq(sessionsTable.teacher_id, appUser.id));

    // Gender scoping (E4): a teacher who can't view all genders only sees
    // sessions for students matching their own gender.
    if (!appUser.can_view_all_genders && appUser.gender) {
      conditions.push(eq(studentsTable.gender, appUser.gender));
    }
  }

  if (studentId) conditions.push(eq(sessionsTable.student_id, studentId));
  if (sessionType) conditions.push(eq(sessionsTable.session_type, sessionType));
  if (dateFrom) conditions.push(gte(sessionsTable.session_date, dateFrom));
  if (dateTo) conditions.push(lte(sessionsTable.session_date, dateTo));

  try {
    const rows = await db
      .select({
        id: sessionsTable.id,
        student_id: sessionsTable.student_id,
        teacher_id: sessionsTable.teacher_id,
        session_date: sessionsTable.session_date,
        session_type: sessionsTable.session_type,
        surah_id: sessionsTable.surah_id,
        from_ayah: sessionsTable.from_ayah,
        to_ayah: sessionsTable.to_ayah,
        pages: sessionsTable.pages,
        rating: sessionsTable.rating,
        notes: sessionsTable.notes,
        created_at: sessionsTable.created_at,
        surah_id_join: surahsTable.id,
        surah_name_arabic: surahsTable.name_arabic,
        surah_total_ayahs: surahsTable.total_ayahs,
        student_id_join: studentsTable.id,
        student_name: studentsTable.name,
        student_gender: studentsTable.gender,
      })
      .from(sessionsTable)
      .leftJoin(surahsTable, eq(sessionsTable.surah_id, surahsTable.id))
      .leftJoin(studentsTable, eq(sessionsTable.student_id, studentsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sessionsTable.session_date));

    const data = rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      teacher_id: r.teacher_id,
      session_date: r.session_date,
      session_type: r.session_type,
      surah_id: r.surah_id,
      from_ayah: r.from_ayah,
      to_ayah: r.to_ayah,
      pages: r.pages,
      rating: r.rating,
      notes: r.notes,
      created_at: r.created_at,
      surahs: r.surah_id_join
        ? { id: r.surah_id_join, name_arabic: r.surah_name_arabic, total_ayahs: r.surah_total_ayahs }
        : null,
      students: r.student_id_join ? { id: r.student_id_join, name: r.student_name } : null,
    }));

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}

// POST /api/sessions — create session
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "teacher" && appUser.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const [surah] = await db
    .select({ total_ayahs: surahsTable.total_ayahs })
    .from(surahsTable)
    .where(eq(surahsTable.id, body.surah_id))
    .limit(1);

  if (!surah) return Response.json({ error: "السورة غير موجودة" }, { status: 400 });

  const validated = validateSessionPayload(body, surah.total_ayahs);
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });

  const { data: sessionPayload } = validated;
  const allowed = await canAccessStudent(db, appUser, sessionPayload.student_id);
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });

  const teacherId = appUser.role === "teacher" ? appUser.id : (body.teacher_id ?? appUser.id);

  try {
    const [created] = await db
      .insert(sessionsTable)
      .values({
        ...sessionPayload,
        teacher_id: teacherId,
      })
      .returning();

    await recalculateStudentSummary(db, sessionPayload.student_id);
    await recalculateStudentAttendance(db, sessionPayload.student_id, {
      affectedDate: sessionPayload.session_date,
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
