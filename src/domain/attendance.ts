/**
 * Pure attendance computation — no I/O, no Drizzle, no Supabase.
 *
 * Attendance is auto-derived from sessions only: a student is "present" on
 * days they have a session. There is no absence tracking, no manual entry,
 * and no excused/holiday statuses. The attendance record is simply a list
 * of dates the student attended (had at least one session).
 */

export type AttendanceStatus = "present";

export interface AttendanceDay {
  date: string;
  status: AttendanceStatus;
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

/**
 * Pure: compute the auto-derived attendance calendar (present days only).
 * Only days with at least one session are included. Respects student status:
 *  - withdrawn/graduated: stop at `statusSince` (fallback `lastSessionDate`).
 *  - paused: skip the paused period [statusSince, today].
 *  - Fridays are always excluded (non-attendance days).
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
    const stop = ctx.statusSince ?? ctx.lastSessionDate;
    if (stop) {
      const stopDate = parseISO(stop);
      const dayBefore = toISO(new Date(stopDate.setDate(stopDate.getDate() - 1)));
      if (dayBefore < end) end = dayBefore;
    }
  }

  for (let d = parseISO(ctx.enrollmentDate); toISO(d) <= end; d = new Date(d.setDate(d.getDate() + 1))) {
    const dateStr = toISO(d);
    if (parseISO(dateStr).getDay() === 5) continue; // Friday
    if (ctx.status === "paused" && ctx.statusSince && dateStr >= ctx.statusSince) {
      continue;
    }
    if (sessionSet.has(dateStr)) {
      result.push({ date: dateStr, status: "present" });
    }
  }

  return result;
}

/**
 * Pure: compute the auto-derived status for a single date.
 * Returns "present" if a session exists on that date and the date is in-scope,
 * otherwise `null` (no attendance record).
 */
export function computeDayAttendance(
  date: string,
  sessionDates: string[],
  ctx: StudentStatusContext,
  today: string = new Date().toISOString().split("T")[0],
): AttendanceStatus | null {
  if (date < ctx.enrollmentDate) return null;
  if (date > today) return null;
  if (parseISO(date).getDay() === 5) return null; // Friday

  const terminal = ctx.status === "withdrawn" || ctx.status === "graduated";
  if (terminal && ctx.statusSince && date >= ctx.statusSince) return null;

  if (ctx.status === "paused" && ctx.statusSince && date >= ctx.statusSince) {
    return null;
  }

  const sessionSet = new Set(sessionDates);
  return sessionSet.has(date) ? "present" : null;
}

export interface RecalcOptions {
  /** When set, only this date is upserted/deleted (incremental). */
  affectedDate?: string;
}
