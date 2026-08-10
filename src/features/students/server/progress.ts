/**
 * DB-fetching shell for juz progress computation.
 *
 * Fetches boundaries, sessions, initial memorization, and ijazat from the
 * DB via Drizzle, then delegates to the pure `computeJuzProgressPure` in
 * `domain/progress.ts`.
 */

import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  ijazatTable,
  initialMemorizationTable,
  juzBoundariesTable,
  juzPagesTable,
  sessionsTable,
  sessionItemsTable,
} from "@/db/schema";
import {
  computeJuzProgressPure,
  type JuzProgress,
  type BoundaryRow,
  type SessionRow,
  type InitialMemRow,
  type IjazaRow,
  type JuzPageRow,
} from "@/domain/progress";

export async function computeJuzProgress(
  db: Db,
  studentId: string,
  referenceDate: Date = new Date()
): Promise<JuzProgress[]> {
  const [boundaries, sessionItems, initialMem, ijazat, juzPages] = await Promise.all([
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
        session_date: sessionsTable.session_date,
        session_type: sessionItemsTable.session_type,
        surah_id: sessionItemsTable.surah_id,
        from_ayah: sessionItemsTable.from_ayah,
        to_ayah: sessionItemsTable.to_ayah,
        rating: sessionItemsTable.rating,
      })
      .from(sessionItemsTable)
      .innerJoin(sessionsTable, eq(sessionItemsTable.session_id, sessionsTable.id))
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
        juz_number: juzPagesTable.juz_number,
        page_number: juzPagesTable.page_number,
        surah_id: juzPagesTable.surah_id,
        from_ayah: juzPagesTable.from_ayah,
        to_ayah: juzPagesTable.to_ayah,
      })
      .from(juzPagesTable),
  ]);

  return computeJuzProgressPure({
    boundaries: boundaries as BoundaryRow[],
    sessions: sessionItems as SessionRow[],
    initialMem: initialMem as InitialMemRow[],
    ijazat: ijazat as IjazaRow[],
    juzPages: juzPages as JuzPageRow[],
    referenceDate
  });
}

export type { JuzProgress };
