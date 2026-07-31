/**
 * Pure attendance calendar computation — no I/O, no Drizzle, no Supabase.
 *
 * `computeAttendanceCalendar` and `computeDayAttendance` are the pure
 * functions exercised by unit tests. The DB-fetching shell
 * (`recalculateStudentAttendance`) lives in
 * `features/attendance/server/recalc.ts`.
 */

import type { StudentStatus } from "./types";

export type AttendanceStatus = "present" | "absent" | "excused" | "holiday";

/** Auto-derived statuses only (manual statuses excused/holiday come from entry). */
export type AutoAttendanceStatus = "present" | "absent";

export interface AttendanceDay {
  date: string;
  status: AutoAttendanceStatus;
}

/**
 * Status context for a student, used to shape the attendance calendar.
 * `statusSince` is the date the current `status` became effective.
 */
export interface StudentStatusContext {
  status: string;
  statusSince: string | null;
  enrollmentDate: string;
  lastSessionDate: string | null;
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDay(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** True if the date is excluded from the auto calendar (Friday / out of range / paused / post-withdrawal). */
function isExcludedDate(
  date: string,
  ctx: StudentStatusContext,
  today: string,
): boolean {
  if (date < ctx.enrollmentDate) return true;
  if (date > today) return true;
  if (parseISO(date).getDay() === 5) return true; // Friday

  const terminal = ctx.status === "withdrawn" || ctx.status === "graduated";
  if (terminal && ctx.statusSince && date >= ctx.statusSince) return true;

  if (ctx.status === "paused" && ctx.statusSince && date >= ctx.statusSince) {
    return true;
  }
  return false;
}

/**
 * Pure: compute the auto-derived attendance calendar (present/absent only).
 * Respects student status (C2):
 *  - withdrawn/graduated: stop the calendar at `statusSince` (fallback
 *    `lastSessionDate`), so no absences accumulate after leaving.
 *  - paused: skip every day in [statusSince, today] — the pause period
 *    generates no absences.
 *  - Fridays are always excluded.
 * Manual statuses (excused/holiday) are NOT produced here; those come from
 * manual entry and are preserved by `recalculateStudentAttendance`.
 */
export function computeAttendanceCalendar(
  sessionDates: string[],
  ctx: StudentStatusContext,
  today: string = new Date().toISOString().split("T")[0],
): AttendanceDay[] {
  const sessionSet = new Set(sessionDates);
  const result: AttendanceDay[] = [];

  let end = today;
  const terminal = ctx.status === "withdrawn" || ctx.status === "graduated";
  if (terminal) {
    // Stop the day BEFORE statusSince — the withdrawal/graduation date itself
    // is not an attendance day (the student has already left).
    const stop = ctx.statusSince ?? ctx.lastSessionDate;
    if (stop) {
      const stopDate = parseISO(stop);
      const dayBefore = toISO(addDay(stopDate, -1));
      if (dayBefore < end) end = dayBefore;
    }
  }

  for (let d = parseISO(ctx.enrollmentDate); toISO(d) <= end; d = addDay(d, 1)) {
    const dateStr = toISO(d);
    if (parseISO(dateStr).getDay() === 5) continue; // Friday
    if (ctx.status === "paused" && ctx.statusSince && dateStr >= ctx.statusSince) {
      continue;
    }
    const status: AutoAttendanceStatus = sessionSet.has(dateStr) ? "present" : "absent";
    result.push({ date: dateStr, status });
  }

  return result;
}

/**
 * Pure: compute the auto-derived status for a single date, or `null` if the
 * date is excluded (Friday, before enrollment, after today, after withdrawal/
 * graduation, or within a paused period). Used for incremental updates (C3)
 * so only the affected date is touched instead of the whole history.
 */
export function computeDayAttendance(
  date: string,
  sessionDates: string[],
  ctx: StudentStatusContext,
  today: string = new Date().toISOString().split("T")[0],
): AutoAttendanceStatus | null {
  if (isExcludedDate(date, ctx, today)) return null;
  const sessionSet = new Set(sessionDates);
  return sessionSet.has(date) ? "present" : "absent";
}

export interface RecalcOptions {
  /** When set, only this date is upserted/deleted (incremental, C3). */
  affectedDate?: string;
}

// Re-export for convenience
export type { StudentStatus };
