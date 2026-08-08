import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { sessionsTable, sessionItemsTable, surahsTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { computeReviewSchedule, groupReviewsByRule, type ReviewableItem } from "@/domain/review";
import { todayDateString } from "@/lib/utils";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/review?date=YYYY-MM-DD
// Returns the spaced-repetition review schedule for the given date.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get("date") ?? todayDateString();

  try {
    // Fetch all new_memorization items for this student
    const items = await db
      .select({
        session_date: sessionsTable.session_date,
        session_type: sessionItemsTable.session_type,
        surah_id: sessionItemsTable.surah_id,
        from_ayah: sessionItemsTable.from_ayah,
        to_ayah: sessionItemsTable.to_ayah,
        surah_name: surahsTable.name_arabic,
      })
      .from(sessionItemsTable)
      .innerJoin(sessionsTable, eq(sessionItemsTable.session_id, sessionsTable.id))
      .leftJoin(surahsTable, eq(sessionItemsTable.surah_id, surahsTable.id))
      .where(eq(sessionsTable.student_id, studentId));

    // Build surah name map
    const surahMap = new Map<number, string>();
    for (const i of items) {
      if (i.surah_name) surahMap.set(i.surah_id, i.surah_name);
    }

    // Filter to new_memorization only for review scheduling
    const reviewableItems: ReviewableItem[] = items
      .filter((i) => i.session_type === "new_memorization")
      .map((i) => ({
        session_date: i.session_date,
        surah_id: i.surah_id,
        from_ayah: i.from_ayah,
        to_ayah: i.to_ayah,
      }));

    const schedule = computeReviewSchedule(targetDate, reviewableItems);

    // Enrich with surah names
    const enriched = schedule.map((r) => ({
      ...r,
      surah_name: surahMap.get(r.surah_id) ?? "",
    }));

    const grouped = groupReviewsByRule(enriched);

    return Response.json({
      date: targetDate,
      grouped,
      total: enriched.length,
    });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "review fetch") }, { status: 500 });
  }
}