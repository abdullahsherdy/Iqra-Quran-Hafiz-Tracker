import { NextRequest } from "next/server";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { sessionsTable, surahsTable, usersTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/sessions — session history for student profile
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sessionType = searchParams.get("session_type") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  const conditions = [eq(sessionsTable.student_id, studentId)];
  if (sessionType) conditions.push(eq(sessionsTable.session_type, sessionType));
  if (dateFrom) conditions.push(gte(sessionsTable.session_date, dateFrom));
  if (dateTo) conditions.push(lte(sessionsTable.session_date, dateTo));

  try {
    const data = await db
      .select({
        id: sessionsTable.id,
        session_date: sessionsTable.session_date,
        session_type: sessionsTable.session_type,
        surah_id: sessionsTable.surah_id,
        from_ayah: sessionsTable.from_ayah,
        to_ayah: sessionsTable.to_ayah,
        pages: sessionsTable.pages,
        rating: sessionsTable.rating,
        notes: sessionsTable.notes,
        teacher_id: sessionsTable.teacher_id,
        surah_name: surahsTable.name_arabic,
        teacher_name: usersTable.name,
      })
      .from(sessionsTable)
      .leftJoin(surahsTable, eq(sessionsTable.surah_id, surahsTable.id))
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(sessionsTable.session_date));

    const sessions = data.map((s) => ({
      id: s.id,
      session_date: s.session_date,
      session_type: s.session_type,
      surah_id: s.surah_id,
      surah_name: s.surah_name ?? "",
      from_ayah: s.from_ayah,
      to_ayah: s.to_ayah,
      pages: s.pages,
      rating: s.rating,
      notes: s.notes,
      teacher_id: s.teacher_id,
      teacher_name: s.teacher_name ?? "",
    }));

    return Response.json(sessions);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
