import "server-only";

import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
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
import {
  computeJuzProgressDetailedPure,
  type DetailedSessionRow,
  type JuzPageRow,
  type JuzProgressDetailed,
} from "@/domain/progress";

/**
 * DB-fetching shell for the DETAILED per-juz progress map (per-surah coverage
 * and per-juz session history). The pure computation lives in
 * `computeJuzProgressDetailedPure`; this shell only fetches.
 *
 * Single source of truth shared by the staff route
 * (`/api/students/[id]/progress`) and the student-portal route
 * (`/api/student/progress`) so both compute progress identically.
 */
export async function loadDetailedProgress(
  db: Db,
  studentId: string,
  referenceDate: Date = new Date()
): Promise<JuzProgressDetailed[]> {
  const [boundaries, sessionItems, initialMem, ijazat, surahs, juzPages] =
    await Promise.all([
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

  const surahMap = new Map<number, string>();
  for (const s of surahs) {
    surahMap.set(s.id, s.name_arabic);
  }

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

  return computeJuzProgressDetailedPure({
    boundaries,
    sessions: detailedSessions,
    initialMem,
    ijazat,
    juzPages: juzPages as JuzPageRow[],
    surahMap,
    referenceDate,
  });
}
