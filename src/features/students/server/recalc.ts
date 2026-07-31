/**
 * DB-fetching shell: recompute a student's cached summary fields.
 *
 * Calls `computeJuzProgress` (from `features/students/server/progress.ts`)
 * and updates `students.memorized_juz_count`, `ijaza_juz_count`, and
 * `last_session_date` in the DB.
 */

import { desc, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { sessionsTable, studentsTable } from "@/db/schema";
import { computeJuzProgress } from "./progress";

/** Plan 05 full recalculation. */
export async function recalculateStudentSummary(
  db: Db,
  studentId: string
): Promise<void> {
  const progress = await computeJuzProgress(db, studentId);
  const memorized_juz_count = progress.filter(
    (p) => p.color === "blue" || p.color === "green"
  ).length;
  const ijaza_juz_count = progress.filter((p) => p.hasIjaza).length;

  const latest = await db
    .select({ session_date: sessionsTable.session_date })
    .from(sessionsTable)
    .where(eq(sessionsTable.student_id, studentId))
    .orderBy(desc(sessionsTable.session_date))
    .limit(1);

  await db
    .update(studentsTable)
    .set({
      memorized_juz_count,
      ijaza_juz_count,
      last_session_date: latest[0]?.session_date ?? null,
    })
    .where(eq(studentsTable.id, studentId));
}
