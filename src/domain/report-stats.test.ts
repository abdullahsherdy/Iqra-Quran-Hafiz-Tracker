import { describe, it, expect } from "vitest";
import {
  computeStudentPageStats,
  computeHonorRoll,
  computeDashboardSummary,
  getPeriodRange,
  filterItemsByPeriod,
  type StudentRow,
  type StudentSessionItemRow,
} from "./report-stats";

// Use a fixed "today" by mocking the date-dependent functions indirectly.
// The functions use Intl.DateTimeFormat with Africa/Cairo timezone.
// We'll use dates that are definitely "today" in Cairo timezone.

function makeStudent(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: "s1",
    name: "أحمد",
    gender: "male",
    status: "active",
    memorized_juz_count: 5,
    ijaza_juz_count: 0,
    last_session_date: null,
    enrollment_date: "2024-01-01",
    ...overrides,
  };
}

function makeItem(
  studentId: string,
  sessionDate: string,
  pages: number | null,
  sessionType: string = "new_memorization",
): StudentSessionItemRow {
  return { student_id: studentId, session_date: sessionDate, session_type: sessionType, pages };
}

function todayCairo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthStartCairo(): string {
  const now = new Date();
  const cairo = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return `${cairo}-01`;
}

function weekStartCairo(): string {
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

describe("computeStudentPageStats", () => {
  it("returns zeros for student with no sessions", () => {
    const stats = computeStudentPageStats([makeStudent()], []);
    expect(stats).toHaveLength(1);
    expect(stats[0].pagesToday).toBe(0);
    expect(stats[0].pagesWeek).toBe(0);
    expect(stats[0].pagesMonth).toBe(0);
    expect(stats[0].pagesSinceEnrollment).toBe(0);
  });

  it("counts pages today correctly", () => {
    const today = todayCairo();
    const items = [
      makeItem("s1", today, 3),
      makeItem("s1", today, 2),
    ];
    const stats = computeStudentPageStats([makeStudent()], items);
    expect(stats[0].pagesToday).toBe(5);
  });

  it("counts pages this week correctly", () => {
    const today = todayCairo();
    const weekStart = weekStartCairo();
    const items = [
      makeItem("s1", today, 3),
      makeItem("s1", weekStart, 2),
    ];
    const stats = computeStudentPageStats([makeStudent()], items);
    expect(stats[0].pagesWeek).toBe(5);
  });

  it("counts pages this month correctly", () => {
    const today = todayCairo();
    const monthStart = monthStartCairo();
    const items = [
      makeItem("s1", today, 3),
      makeItem("s1", monthStart, 2),
    ];
    const stats = computeStudentPageStats([makeStudent()], items);
    expect(stats[0].pagesMonth).toBe(5);
  });

  it("counts pages since enrollment as total of all items", () => {
    const items = [
      makeItem("s1", "2024-01-15", 3),
      makeItem("s1", "2024-06-20", 2),
      makeItem("s1", "2025-01-10", 4),
    ];
    const stats = computeStudentPageStats([makeStudent()], items);
    expect(stats[0].pagesSinceEnrollment).toBe(9);
  });

  it("treats null pages as 0", () => {
    const today = todayCairo();
    const items = [
      makeItem("s1", today, null),
      makeItem("s1", today, 3),
    ];
    const stats = computeStudentPageStats([makeStudent()], items);
    expect(stats[0].pagesToday).toBe(3);
    expect(stats[0].pagesSinceEnrollment).toBe(3);
  });

  it("sorts by pagesMonth descending", () => {
    const today = todayCairo();
    const students = [
      makeStudent({ id: "s1", name: "أحمد" }),
      makeStudent({ id: "s2", name: "محمد" }),
    ];
    const items = [
      makeItem("s1", today, 2),
      makeItem("s2", today, 5),
    ];
    const stats = computeStudentPageStats(students, items);
    expect(stats[0].studentId).toBe("s2");
    expect(stats[1].studentId).toBe("s1");
  });

  it("handles multiple students with mixed data", () => {
    const today = todayCairo();
    const students = [
      makeStudent({ id: "s1", name: "أحمد", memorized_juz_count: 3 }),
      makeStudent({ id: "s2", name: "محمد", memorized_juz_count: 7, status: "paused" }),
    ];
    const items = [
      makeItem("s1", today, 2),
      makeItem("s2", "2024-01-01", 10),
    ];
    const stats = computeStudentPageStats(students, items);
    expect(stats).toHaveLength(2);
    const s1 = stats.find((s) => s.studentId === "s1")!;
    const s2 = stats.find((s) => s.studentId === "s2")!;
    expect(s1.pagesToday).toBe(2);
    expect(s1.pagesSinceEnrollment).toBe(2);
    expect(s2.pagesToday).toBe(0);
    expect(s2.pagesSinceEnrollment).toBe(10);
    expect(s2.status).toBe("paused");
  });
});

describe("computeHonorRoll", () => {
  it("returns top N by pages today", () => {
    const today = todayCairo();
    const students = [
      makeStudent({ id: "s1", name: "أحمد" }),
      makeStudent({ id: "s2", name: "محمد" }),
      makeStudent({ id: "s3", name: "علي" }),
    ];
    const items = [
      makeItem("s1", today, 5),
      makeItem("s2", today, 3),
      makeItem("s3", today, 1),
    ];
    const stats = computeStudentPageStats(students, items);
    const honor = computeHonorRoll(stats, "today", 2);
    expect(honor).toHaveLength(2);
    expect(honor[0].name).toBe("أحمد");
    expect(honor[0].pages).toBe(5);
    expect(honor[1].name).toBe("محمد");
  });

  it("returns top N by pages this month", () => {
    const today = todayCairo();
    const students = [
      makeStudent({ id: "s1", name: "أحمد" }),
      makeStudent({ id: "s2", name: "محمد" }),
    ];
    const items = [
      makeItem("s1", today, 5),
      makeItem("s2", today, 10),
    ];
    const stats = computeStudentPageStats(students, items);
    const honor = computeHonorRoll(stats, "month", 5);
    expect(honor[0].name).toBe("محمد");
    expect(honor[0].pages).toBe(10);
  });

  it("excludes students with 0 pages", () => {
    const students = [
      makeStudent({ id: "s1", name: "أحمد" }),
      makeStudent({ id: "s2", name: "محمد" }),
    ];
    const items = [makeItem("s1", "2024-01-01", 5)];
    const stats = computeStudentPageStats(students, items);
    const honor = computeHonorRoll(stats, "today", 5);
    expect(honor).toHaveLength(0);
  });
});

describe("computeDashboardSummary", () => {
  it("computes summary from students and items", () => {
    const today = todayCairo();
    const students = [
      makeStudent({ id: "s1", status: "active" }),
      makeStudent({ id: "s2", status: "paused" }),
      makeStudent({ id: "s3", status: "active" }),
    ];
    const items = [
      makeItem("s1", today, 3),
      makeItem("s2", today, 2),
    ];
    const summary = computeDashboardSummary(students, items, [today], [today], 5);
    expect(summary.activeStudents).toBe(2);
    expect(summary.sessionsToday).toBe(1);
    expect(summary.pagesToday).toBe(5);
    expect(summary.activeTeachers).toBe(5);
  });

  it("handles empty data", () => {
    const summary = computeDashboardSummary([], [], [], [], 0);
    expect(summary.activeStudents).toBe(0);
    expect(summary.sessionsToday).toBe(0);
    expect(summary.pagesToday).toBe(0);
    expect(summary.pagesMonth).toBe(0);
  });
});

describe("getPeriodRange", () => {
  it("returns week range", () => {
    const range = getPeriodRange("week", "2024-01-01");
    expect(range.label).toBe("آخر أسبوع");
    expect(range.to).toBe(todayCairo());
    expect(range.from).toBe(weekStartCairo());
  });

  it("returns month range", () => {
    const range = getPeriodRange("month", "2024-01-01");
    expect(range.label).toBe("هذا الشهر");
    expect(range.from).toBe(monthStartCairo());
  });

  it("returns enrollment range", () => {
    const range = getPeriodRange("enrollment", "2024-06-15");
    expect(range.label).toBe("منذ الانضمام");
    expect(range.from).toBe("2024-06-15");
  });
});

describe("filterItemsByPeriod", () => {
  it("filters items within the date range", () => {
    const items = [
      makeItem("s1", "2024-01-01", 3),
      makeItem("s1", "2024-06-15", 2),
      makeItem("s1", "2024-12-31", 4),
    ];
    const range = { from: "2024-06-01", to: "2024-12-31", label: "test" };
    const filtered = filterItemsByPeriod(items, range);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].session_date).toBe("2024-06-15");
    expect(filtered[1].session_date).toBe("2024-12-31");
  });

  it("includes boundary dates", () => {
    const items = [
      makeItem("s1", "2024-06-01", 3),
      makeItem("s1", "2024-06-30", 2),
    ];
    const range = { from: "2024-06-01", to: "2024-06-30", label: "test" };
    const filtered = filterItemsByPeriod(items, range);
    expect(filtered).toHaveLength(2);
  });

  it("returns empty for no matching items", () => {
    const items = [makeItem("s1", "2023-01-01", 3)];
    const range = { from: "2024-01-01", to: "2024-12-31", label: "test" };
    const filtered = filterItemsByPeriod(items, range);
    expect(filtered).toHaveLength(0);
  });
});
