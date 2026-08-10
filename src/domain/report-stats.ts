/**
 * Pure report statistics computation — no I/O, no Drizzle, no Supabase.
 *
 * Computes pages-saved statistics per student for dashboard tables,
 * honor roll rankings, and summary stat cards.
 *
 * Uses `session_items.pages` column only. Null pages = 0 (per design decision).
 */

export interface StudentSessionItemRow {
  student_id: string;
  session_date: string;
  session_type: string;
  pages: number | null;
}

export interface StudentRow {
  id: string;
  name: string;
  gender: string;
  status: string;
  memorized_juz_count: number;
  ijaza_juz_count: number;
  last_session_date: string | null;
  enrollment_date: string;
}

export interface StudentPageStats {
  studentId: string;
  name: string;
  gender: string;
  status: string;
  memorizedJuzCount: number;
  ijazaJuzCount: number;
  lastSessionDate: string | null;
  pagesToday: number;
  pagesWeek: number;
  pagesMonth: number;
  pagesSinceEnrollment: number;
  totalSessions: number;
  avgPagesPerSession: number;
}

export interface DashboardSummary {
  activeStudents: number;
  sessionsToday: number;
  sessionsMonth: number;
  pagesToday: number;
  pagesMonth: number;
  activeTeachers: number;
}

export type HonorRollPeriod = "today" | "month";

export interface HonorRollEntry {
  studentId: string;
  name: string;
  pages: number;
  memorizedJuzCount: number;
}

/** Date string helpers using Africa/Cairo timezone. */

function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthStartStr(): string {
  const now = new Date();
  const cairo = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return `${cairo}-01`;
}

function weekStartStr(): string {
  const now = new Date();
  const past = new Date(now);
  past.setDate(now.getDate() - 6);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(past);
}

/** Sum pages for items matching a date predicate. Null pages = 0. */
function sumPages(
  items: StudentSessionItemRow[],
  pred: (date: string) => boolean,
): number {
  let total = 0;
  for (const item of items) {
    if (pred(item.session_date) && item.pages !== null) {
      total += item.pages;
    }
  }
  return total;
}

/**
 * Compute per-student page statistics from session item rows.
 *
 * @param students Array of student rows
 * @param items Array of session item rows (with student_id, session_date, pages)
 * @returns Per-student stats sorted by pagesMonth descending
 */
export function computeStudentPageStats(
  students: StudentRow[],
  items: StudentSessionItemRow[],
): StudentPageStats[] {
  const today = todayStr();
  const weekStart = weekStartStr();
  const monthStart = monthStartStr();

  const itemsByStudent = new Map<string, StudentSessionItemRow[]>();
  for (const item of items) {
    let list = itemsByStudent.get(item.student_id);
    if (!list) {
      list = [];
      itemsByStudent.set(item.student_id, list);
    }
    list.push(item);
  }

  return students
    .map((student): StudentPageStats => {
      const studentItems = itemsByStudent.get(student.id) ?? [];
      const pagesSinceEnrollment = sumPages(studentItems, () => true);
      const totalSessions = new Set(studentItems.map((i) => i.session_date)).size;
      return {
        studentId: student.id,
        name: student.name,
        gender: student.gender,
        status: student.status,
        memorizedJuzCount: student.memorized_juz_count,
        ijazaJuzCount: student.ijaza_juz_count,
        lastSessionDate: student.last_session_date,
        pagesToday: sumPages(studentItems, (d) => d === today),
        pagesWeek: sumPages(studentItems, (d) => d >= weekStart),
        pagesMonth: sumPages(studentItems, (d) => d >= monthStart),
        pagesSinceEnrollment,
        totalSessions,
        avgPagesPerSession: totalSessions > 0 ? pagesSinceEnrollment / totalSessions : 0,
      };
    })
    .sort((a, b) => b.pagesMonth - a.pagesMonth);
}

/**
 * Compute honor roll — top N students by pages saved in the given period.
 */
export function computeHonorRoll(
  stats: StudentPageStats[],
  period: HonorRollPeriod,
  topN: number = 5,
): HonorRollEntry[] {
  const key = period === "today" ? "pagesToday" : "pagesMonth";
  return [...stats]
    .filter((s) => s[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, topN)
    .map((s) => ({
      studentId: s.studentId,
      name: s.name,
      pages: s[key],
      memorizedJuzCount: s.memorizedJuzCount,
    }));
}

/**
 * Compute dashboard summary stat cards from students + session items.
 */
export function computeDashboardSummary(
  students: StudentRow[],
  items: StudentSessionItemRow[],
  sessionDatesToday: string[],
  sessionDatesMonth: string[],
  activeTeachers: number = 0,
): DashboardSummary {
  const today = todayStr();
  const monthStart = monthStartStr();

  const activeStudents = students.filter((s) => s.status === "active").length;

  const pagesToday = sumPages(items, (d) => d === today);
  const pagesMonth = sumPages(items, (d) => d >= monthStart);

  return {
    activeStudents,
    sessionsToday: sessionDatesToday.length,
    sessionsMonth: sessionDatesMonth.length,
    pagesToday,
    pagesMonth,
    activeTeachers,
  };
}

// --- Parent report period helpers ---

export type ReportPeriod = "week" | "month" | "enrollment";

export interface PeriodRange {
  from: string;
  to: string;
  label: string;
}

/** Compute the date range for a report period. */
export function getPeriodRange(
  period: ReportPeriod,
  enrollmentDate: string,
): PeriodRange {
  const to = todayStr();
  switch (period) {
    case "week":
      return { from: weekStartStr(), to, label: "آخر أسبوع" };
    case "month":
      return { from: monthStartStr(), to, label: "هذا الشهر" };
    case "enrollment":
      return { from: enrollmentDate, to, label: "منذ الانضمام" };
  }
}

/** Filter session items to a date range [from, to] inclusive. */
export function filterItemsByPeriod(
  items: StudentSessionItemRow[],
  range: PeriodRange,
): StudentSessionItemRow[] {
  return items.filter(
    (item) => item.session_date >= range.from && item.session_date <= range.to,
  );
}
