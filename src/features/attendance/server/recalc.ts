/**
 * DB-fetching shell: recompute a student's auto-derived attendance rows.
 *
 * Attendance is auto-derived from sessions only — a row is created for each
 * day the student has a session. There is no absence tracking and no manual
 * entry. Uses the pure `computeAttendanceCalendar` / `computeDayAttendance`
 * from `domain/attendance.ts` and persists results via Drizzle.
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
 * Recompute a student's auto-derived attendance rows (present days only).
 *
 * - With `affectedDate`: only that date is reconciled — O(1) DB writes.
 * - Without `affectedDate` (full recalc / backfill): all rows are rebuilt.
 * - Graceful: if the student has no `enrollment_date`, returns silently.
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

  const today = todayDateString();

  if (opts?.affectedDate) {
    const dayStatus = computeDayAttendance(opts.affectedDate, sessionDates, ctx, today);

    // Remove any existing record for this date.
    await db
      .delete(attendanceTable)
      .where(
        and(
          eq(attendanceTable.student_id, studentId),
          eq(attendanceTable.attendance_date, opts.affectedDate),
        ),
      );

    // Insert a present record only if the day has a session and is in-scope.
    if (dayStatus === "present") {
      await db
        .insert(attendanceTable)
        .values({
          student_id: studentId,
          attendance_date: opts.affectedDate,
          status: "present",
        })
        .onConflictDoNothing({
          target: [attendanceTable.student_id, attendanceTable.attendance_date],
        });
    }
    return;
  }

  // Full recalc: wipe all rows, rebuild from calendar (present days only).
  await db
    .delete(attendanceTable)
    .where(eq(attendanceTable.student_id, studentId));

  const calendar = computeAttendanceCalendar(sessionDates, ctx, today);
  const toInsert = calendar.map((day) => ({
    student_id: studentId,
    attendance_date: day.date,
    status: "present" as const,
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
