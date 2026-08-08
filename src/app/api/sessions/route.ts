import { NextRequest } from "next/server";
import { and, desc, eq, gte, lte, inArray } from "drizzle-orm";

import { sessionsTable, sessionItemsTable, surahsTable, studentsTable, usersTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { validateSessionPayload } from "@/domain/sessions";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { recalculateStudentAttendance } from "@/features/attendance/server/recalc";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";
import { isAdmin } from "@/features/auth/shared";
import { logAction } from "@/features/audit/audit-log";
import { todayDateString } from "@/lib/utils";

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
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  const conditions = [];

  if (appUser.role === "teacher") {
    conditions.push(eq(sessionsTable.teacher_id, appUser.id));

    if (!appUser.can_view_all_genders && appUser.gender) {
      conditions.push(eq(studentsTable.gender, appUser.gender));
    }
  }

  if (studentId) conditions.push(eq(sessionsTable.student_id, studentId));
  if (dateFrom) conditions.push(gte(sessionsTable.session_date, dateFrom));
  if (dateTo) conditions.push(lte(sessionsTable.session_date, dateTo));

  try {
    const rows = await db
      .select({
        id: sessionsTable.id,
        student_id: sessionsTable.student_id,
        teacher_id: sessionsTable.teacher_id,
        session_date: sessionsTable.session_date,
        overall_rating: sessionsTable.overall_rating,
        notes: sessionsTable.notes,
        created_at: sessionsTable.created_at,
        student_name: studentsTable.name,
        student_gender: studentsTable.gender,
        teacher_name: usersTable.name,
      })
      .from(sessionsTable)
      .leftJoin(studentsTable, eq(sessionsTable.student_id, studentsTable.id))
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sessionsTable.session_date))
      .limit(limit)
      .offset(offset);

    if (rows.length === 0) return Response.json([]);

    // Fetch items for all sessions in one query
    const sessionIds = rows.map((r) => r.id);
    const itemRows = await db
      .select({
        session_id: sessionItemsTable.session_id,
        id: sessionItemsTable.id,
        session_type: sessionItemsTable.session_type,
        surah_id: sessionItemsTable.surah_id,
        from_ayah: sessionItemsTable.from_ayah,
        to_ayah: sessionItemsTable.to_ayah,
        rating: sessionItemsTable.rating,
        pages: sessionItemsTable.pages,
        notes: sessionItemsTable.notes,
        surah_name: surahsTable.name_arabic,
      })
      .from(sessionItemsTable)
      .leftJoin(surahsTable, eq(sessionItemsTable.surah_id, surahsTable.id))
      .where(inArray(sessionItemsTable.session_id, sessionIds));

    // Group items by session
    const itemsBySession = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsBySession.get(item.session_id);
      if (list) list.push(item);
      else itemsBySession.set(item.session_id, [item]);
    }

    // Filter by session_type if specified (on items, not sessions)
    const data = rows
      .map((r) => {
        const items = (itemsBySession.get(r.id) ?? []).map((item) => ({
          id: item.id,
          session_type: item.session_type,
          surah_id: item.surah_id,
          from_ayah: item.from_ayah,
          to_ayah: item.to_ayah,
          rating: item.rating,
          pages: item.pages,
          notes: item.notes,
          surah_name: item.surah_name ?? "",
        }));

        return {
          id: r.id,
          student_id: r.student_id,
          teacher_id: r.teacher_id,
          session_date: r.session_date,
          overall_rating: r.overall_rating,
          notes: r.notes,
          created_at: r.created_at,
          teacher_name: r.teacher_name ?? "",
          students: r.student_id ? { id: r.student_id, name: r.student_name, gender: r.student_gender } : null,
          items: sessionType ? items.filter((i) => i.session_type === sessionType) : items,
        };
      })
      // If filtering by type, exclude sessions with no matching items
      .filter((s) => !sessionType || s.items.length > 0);

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}

// POST /api/sessions — create session with items
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "teacher" && !isAdmin(appUser.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  // Fetch surah ayah counts for all surah_ids referenced in items
  const surahIds: number[] = Array.isArray(body.items)
    ? body.items.map((i: { surah_id?: number }) => Number(i?.surah_id)).filter((n: number) => !Number.isNaN(n) && n > 0)
    : [];

  const surahRows = surahIds.length > 0
    ? await db.select({ id: surahsTable.id, total_ayahs: surahsTable.total_ayahs }).from(surahsTable).where(inArray(surahsTable.id, surahIds))
    : [];

  if (surahIds.length > 0 && surahRows.length !== surahIds.length) {
    return Response.json({ error: "السورة غير موجودة" }, { status: 400 });
  }

  const surahAyahCounts = new Map(surahRows.map((s) => [s.id, s.total_ayahs]));

  const validated = validateSessionPayload(body, surahAyahCounts, todayDateString());
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });

  const { data: sessionPayload } = validated;
  const allowed = await canAccessStudent(db, appUser, sessionPayload.student_id);
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });

  const teacherId = appUser.role === "teacher" ? appUser.id : (body.teacher_id ?? appUser.id);

  try {
    const [created] = await db.transaction(async (tx) => {
      const [session] = await tx
        .insert(sessionsTable)
        .values({
          student_id: sessionPayload.student_id,
          teacher_id: teacherId,
          session_date: sessionPayload.session_date,
          overall_rating: sessionPayload.overall_rating,
          notes: sessionPayload.notes ?? null,
        })
        .returning();

      const itemRows = sessionPayload.items.map((item) => ({
        session_id: session.id,
        session_type: item.session_type,
        surah_id: item.surah_id,
        from_ayah: item.from_ayah,
        to_ayah: item.to_ayah,
        rating: item.rating,
        pages: item.pages ?? null,
        notes: item.notes ?? null,
      }));

      await tx.insert(sessionItemsTable).values(itemRows);

      return [session];
    });

    await recalculateStudentSummary(db, sessionPayload.student_id);
    await recalculateStudentAttendance(db, sessionPayload.student_id, {
      affectedDate: sessionPayload.session_date,
    });
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "create",
      entityType: "session",
      entityId: created.id,
      method: "POST",
      path: "/api/sessions",
      statusCode: 201,
      requestBody: { student_id: sessionPayload.student_id, session_date: sessionPayload.session_date, items_count: sessionPayload.items.length },
      responseBody: { id: created.id },
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "create",
      entityType: "session",
      method: "POST",
      path: "/api/sessions",
      statusCode: 500,
      requestBody: { student_id: sessionPayload.student_id, session_date: sessionPayload.session_date },
      responseBody: { error: sanitizeError(error, "api") },
    });
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}