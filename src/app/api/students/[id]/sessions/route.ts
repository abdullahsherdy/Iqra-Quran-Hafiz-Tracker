import { NextRequest } from "next/server";
import { and, eq, gte, lte, desc, inArray } from "drizzle-orm";
import { sessionsTable, sessionItemsTable, surahsTable, usersTable } from "@/db/schema";
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
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  const conditions = [eq(sessionsTable.student_id, studentId)];
  if (dateFrom) conditions.push(gte(sessionsTable.session_date, dateFrom));
  if (dateTo) conditions.push(lte(sessionsTable.session_date, dateTo));

  try {
    const sessions = await db
      .select({
        id: sessionsTable.id,
        session_date: sessionsTable.session_date,
        overall_rating: sessionsTable.overall_rating,
        notes: sessionsTable.notes,
        teacher_id: sessionsTable.teacher_id,
        teacher_name: usersTable.name,
      })
      .from(sessionsTable)
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(sessionsTable.session_date))
      .limit(limit)
      .offset(offset);

    if (sessions.length === 0) return Response.json([]);

    // Fetch items for all sessions
    const sessionIds = sessions.map((s) => s.id);
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

    const itemsBySession = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsBySession.get(item.session_id);
      if (list) list.push(item);
      else itemsBySession.set(item.session_id, [item]);
    }

    const result = sessions.map((s) => {
      const items = (itemsBySession.get(s.id) ?? []).map((item) => ({
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
        id: s.id,
        session_date: s.session_date,
        overall_rating: s.overall_rating,
        notes: s.notes,
        teacher_id: s.teacher_id,
        teacher_name: s.teacher_name ?? "",
        items: sessionType ? items.filter((i) => i.session_type === sessionType) : items,
      };
    }).filter((s) => !sessionType || s.items.length > 0);

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}