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
  sessionsTable,
} from "@/db/schema";
import {
  computeJuzProgressPure,
  type JuzProgress,
  type BoundaryRow,
  type SessionRow,
  type InitialMemRow,
  type IjazaRow,
} from "@/domain/progress";

export async function computeJuzProgress(
  db: Db,
  studentId: string,
  referenceDate: Date = new Date()
): Promise<JuzProgress[]> {
  const [boundaries, sessions, initialMem, ijazat] = await Promise.all([
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
        session_type: sessionsTable.session_type,
        surah_id: sessionsTable.surah_id,
        from_ayah: sessionsTable.from_ayah,
        to_ayah: sessionsTable.to_ayah,
        rating: sessionsTable.rating,
      })
      .from(sessionsTable)
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
  ]);

  return computeJuzProgressPure({
    boundaries: boundaries as BoundaryRow[],
    sessions: sessions as SessionRow[],
    initialMem: initialMem as InitialMemRow[],
    ijazat: ijazat as IjazaRow[],
    referenceDate
  });
}

export type { JuzProgress };
