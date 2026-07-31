/**
 * DB-fetching shell: recompute a student's auto-derived attendance rows.
 *
 * Uses the pure `computeAttendanceCalendar` / `computeDayAttendance` from
 * `domain/attendance.ts` and persists results via Drizzle. Manual records
 * (`recorded_manually = true`) are preserved (C4). Supports incremental
 * updates via `affectedDate` (C3).
 */

import { and, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { attendanceTable, sessionsTable, studentsTable } from "@/db/schema";
import {
  computeAttendanceCalendar,
  computeDayAttendance,
  type StudentStatusContext,
  type RecalcOptions,
} from "@/domain/attendance";
import { todayDateString } from "@/lib/utils";

/**
 * Recompute a student's auto-derived attendance rows.
 *
 * - Manual records (`recorded_manually = true`) are NEVER touched: they win
 *   over auto-derivation for their date (C4).
 * - With `affectedDate` (C3): only that date is reconciled — O(1) DB writes
 *   instead of deleting + reinserting the entire history.
 * - Without `affectedDate` (full recalc / backfill): all auto rows are
 *   rebuilt, preserving manual records.
 * - Graceful (E7): if the student has no `enrollment_date`, returns silently
 *   rather than throwing.
 */
export async function recalculateStudentAttendance(
  db: Db,
  studentId: string,
  opts?: RecalcOptions,
): Promise<void> {
  const [student] = await db
    .select({
      enrollment_date: studentsTable.enrollment_date,
      status: studentsTable.status,
      status_since: studentsTable.status_since,
      last_session_date: studentsTable.last_session_date,
    })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  if (!student?.enrollment_date) return;

  const ctx: StudentStatusContext = {
    status: student.status,
    statusSince: student.status_since,
    enrollmentDate: student.enrollment_date,
    lastSessionDate: student.last_session_date,
  };

  const sessions = await db
    .select({ session_date: sessionsTable.session_date })
    .from(sessionsTable)
    .where(eq(sessionsTable.student_id, studentId));
  const sessionDates = sessions.map((s) => s.session_date);

  const manualRows = await db
    .select({ attendance_date: attendanceTable.attendance_date })
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.student_id, studentId),
        eq(attendanceTable.recorded_manually, true),
      ),
    );
  const manualDates = new Set(manualRows.map((r) => r.attendance_date));

  const today = todayDateString();

  if (opts?.affectedDate) {
    const dayStatus = computeDayAttendance(opts.affectedDate, sessionDates, ctx, today);

    // Remove any existing AUTO record for this date (manual records are safe).
    await db
      .delete(attendanceTable)
      .where(
        and(
          eq(attendanceTable.student_id, studentId),
          eq(attendanceTable.attendance_date, opts.affectedDate),
          eq(attendanceTable.recorded_manually, false),
        ),
      );

    // Insert/replace an auto record only if the day is in-scope and not manual.
    if (dayStatus && !manualDates.has(opts.affectedDate)) {
      await db
        .insert(attendanceTable)
        .values({
          student_id: studentId,
          teacher_id: null,
          attendance_date: opts.affectedDate,
          status: dayStatus,
          notes: null,
          recorded_manually: false,
        })
        .onConflictDoNothing({
          target: [attendanceTable.student_id, attendanceTable.attendance_date],
        });
    }
    return;
  }

  // Full recalc: wipe auto rows, rebuild from calendar (skip manual dates).
  await db
    .delete(attendanceTable)
    .where(
      and(
        eq(attendanceTable.student_id, studentId),
        eq(attendanceTable.recorded_manually, false),
      ),
    );

  const calendar = computeAttendanceCalendar(sessionDates, ctx, today);
  const toInsert = calendar
    .filter((day) => !manualDates.has(day.date))
    .map((day) => ({
      student_id: studentId,
      teacher_id: null,
      attendance_date: day.date,
      status: day.status,
      notes: null,
      recorded_manually: false,
    }));

  if (toInsert.length > 0) {
    await db
      .insert(attendanceTable)
      .values(toInsert)
      .onConflictDoNothing({
        target: [attendanceTable.student_id, attendanceTable.attendance_date],
      });
  }
}
