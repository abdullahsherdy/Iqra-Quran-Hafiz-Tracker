import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  juzBoundariesTable,
  sessionsTable,
  initialMemorizationTable,
  ijazatTable,
  surahsTable,
  usersTable,
} from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { computeJuzProgressDetailedPure, type DetailedSessionRow } from "@/domain/progress";
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
    const [boundaries, sessions, initialMem, ijazat, surahs] = await Promise.all([
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
          id: sessionsTable.id,
          session_date: sessionsTable.session_date,
          session_type: sessionsTable.session_type,
          surah_id: sessionsTable.surah_id,
          from_ayah: sessionsTable.from_ayah,
          to_ayah: sessionsTable.to_ayah,
          rating: sessionsTable.rating,
          notes: sessionsTable.notes,
          teacher_name: usersTable.name,
        })
        .from(sessionsTable)
        .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
        .where(eq(sessionsTable.student_id, studentId)),
      db
        .select({
          juz_number: initialMemorizationTable.juz_number,
          status: initialMemorizationTable.status,
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
    ]);

    // Build surah name map
    const surahMap = new Map<number, string>();
    for (const s of surahs) {
      surahMap.set(s.id, s.name_arabic);
    }

    // Map sessions to the detailed row shape (extract teacher name from the join)
    const detailedSessions: DetailedSessionRow[] = sessions.map((s) => ({
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
      surahMap,
      referenceDate: new Date(),
    });

    return Response.json(enrichedProgress);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "progress fetch") }, { status: 500 });
  }
}
