import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  juzBoundariesTable,
  juzPagesTable,
  sessionsTable,
  sessionItemsTable,
  initialMemorizationTable,
  ijazatTable,
  surahsTable,
  usersTable,
} from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { computeJuzProgressDetailedPure, type DetailedSessionRow, type JuzPageRow } from "@/domain/progress";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/progress — detailed progress map data
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Load all required data in parallel
    const [boundaries, sessionItems, initialMem, ijazat, surahs, juzPages] = await Promise.all([
      db
        .select({
          juz_number: juzBoundariesTable.juz_number,
          surah_id: juzBoundariesTable.surah_id,
          from_ayah: juzBoundariesTable.from_ayah,
          to_ayah: juzBoundariesTable.to_ayah,
        })
        .from(juzBoundariesTable),
      db
        .select({
          id: sessionItemsTable.id,
          session_date: sessionsTable.session_date,
          session_type: sessionItemsTable.session_type,
          surah_id: sessionItemsTable.surah_id,
          from_ayah: sessionItemsTable.from_ayah,
          to_ayah: sessionItemsTable.to_ayah,
          rating: sessionItemsTable.rating,
          notes: sessionItemsTable.notes,
          teacher_name: usersTable.name,
        })
        .from(sessionItemsTable)
        .innerJoin(sessionsTable, eq(sessionItemsTable.session_id, sessionsTable.id))
        .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
        .where(eq(sessionsTable.student_id, studentId)),
      db
        .select({
          juz_number: initialMemorizationTable.juz_number,
          status: initialMemorizationTable.status,
          pages: initialMemorizationTable.pages,
        })
        .from(initialMemorizationTable)
        .where(eq(initialMemorizationTable.student_id, studentId)),
      db
        .select({
          ijaza_type: ijazatTable.ijaza_type,
          juz_number: ijazatTable.juz_number,
        })
        .from(ijazatTable)
        .where(eq(ijazatTable.student_id, studentId)),
      db
        .select({
          id: surahsTable.id,
          name_arabic: surahsTable.name_arabic,
        })
        .from(surahsTable),
      db
        .select({
          juz_number: juzPagesTable.juz_number,
          page_number: juzPagesTable.page_number,
          surah_id: juzPagesTable.surah_id,
          from_ayah: juzPagesTable.from_ayah,
          to_ayah: juzPagesTable.to_ayah,
        })
        .from(juzPagesTable),
    ]);

    // Build surah name map
    const surahMap = new Map<number, string>();
    for (const s of surahs) {
      surahMap.set(s.id, s.name_arabic);
    }

    // Map session items to the detailed row shape
    const detailedSessions: DetailedSessionRow[] = sessionItems.map((s) => ({
      id: s.id,
      session_date: s.session_date,
      session_type: s.session_type,
      surah_id: s.surah_id,
      from_ayah: s.from_ayah,
      to_ayah: s.to_ayah,
      rating: s.rating,
      notes: s.notes,
      teacher_name: s.teacher_name ?? "",
    }));

    const enrichedProgress = computeJuzProgressDetailedPure({
      boundaries,
      sessions: detailedSessions,
      initialMem,
      ijazat,
      juzPages: juzPages as JuzPageRow[],
      surahMap,
      referenceDate: new Date(),
    });

    return Response.json(enrichedProgress);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "progress fetch") }, { status: 500 });
  }
}