import { describe, it, expect } from "vitest";
import {
  computeAttendanceCalendar,
  computeDayAttendance,
  type StudentStatusContext,
} from "./attendance";

const baseCtx = (overrides: Partial<StudentStatusContext> = {}): StudentStatusContext => ({
  status: "active",
  statusSince: null,
  enrollmentDate: "2024-07-01",
  lastSessionDate: null,
  ...overrides,
});

describe("computeAttendanceCalendar", () => {
  it("basic present/absent logic", () => {
    // 2024-07-01 (Mon) -> present, 02 (Tue) -> absent, 03 (Wed) -> present, 04 (Thu) -> absent
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-03"],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toEqual([
      { date: "2024-07-01", status: "present" },
      { date: "2024-07-02", status: "absent" },
      { date: "2024-07-03", status: "present" },
      { date: "2024-07-04", status: "absent" },
    ]);
  });

  it("excludes Fridays", () => {
    // 2024-07-05 is Friday
    const result = computeAttendanceCalendar(
      ["2024-07-06"],
      baseCtx(),
      "2024-07-10",
    );
    const dates = result.map((d) => d.date);
    expect(dates).not.toContain("2024-07-05");
    expect(result).toHaveLength(9); // 10 days minus 1 Friday
  });

  it("all absent when no sessions", () => {
    const result = computeAttendanceCalendar([], baseCtx(), "2024-07-03");
    expect(result.every((d) => d.status === "absent")).toBe(true);
    expect(result).toHaveLength(3);
  });

  it("single day range", () => {
    const result = computeAttendanceCalendar(["2024-07-01"], baseCtx(), "2024-07-01");
    expect(result).toEqual([{ date: "2024-07-01", status: "present" }]);
  });

  it("multiple sessions on same day still present", () => {
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-01", "2024-07-02"],
      baseCtx(),
      "2024-07-03",
    );
    expect(result[0]).toEqual({ date: "2024-07-01", status: "present" });
    expect(result[1]).toEqual({ date: "2024-07-02", status: "present" });
    expect(result[2]).toEqual({ date: "2024-07-03", status: "absent" });
  });

  // C2: status-aware calendar
  it("paused student: skips paused period entirely (no absences)", () => {
    // Paused from 2024-07-05; calendar should stop generating absences from that date.
    const ctx = baseCtx({ status: "paused", statusSince: "2024-07-05" });
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-03"],
      ctx,
      "2024-07-10",
    );
    // Days 1-4 (Mon-Thu) generated, day 5 (Fri) excluded, days 6-10 skipped (paused)
    const dates = result.map((d) => d.date);
    expect(dates).toEqual(["2024-07-01", "2024-07-02", "2024-07-03", "2024-07-04"]);
    // No absences from the paused period
    expect(dates).not.toContain("2024-07-06");
    expect(dates).not.toContain("2024-07-10");
  });

  it("withdrawn student: calendar stops at statusSince", () => {
    // Withdrawn on 2024-07-05; calendar should not extend past that date.
    const ctx = baseCtx({ status: "withdrawn", statusSince: "2024-07-05" });
    const result = computeAttendanceCalendar(
      ["2024-07-01"],
      ctx,
      "2024-07-10",
    );
    const dates = result.map((d) => d.date);
    expect(dates).toContain("2024-07-04");
    expect(dates).not.toContain("2024-07-05");
    expect(dates).not.toContain("2024-07-06");
  });

  it("graduated student: calendar stops at statusSince", () => {
    const ctx = baseCtx({ status: "graduated", statusSince: "2024-07-03" });
    const result = computeAttendanceCalendar(["2024-07-01"], ctx, "2024-07-10");
    const dates = result.map((d) => d.date);
    expect(dates).toEqual(["2024-07-01", "2024-07-02"]);
  });
});

describe("computeDayAttendance (incremental, C3)", () => {
  it("returns present when a session exists on that date", () => {
    const result = computeDayAttendance(
      "2024-07-01",
      ["2024-07-01"],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toBe("present");
  });

  it("returns absent when no session on that date", () => {
    const result = computeDayAttendance(
      "2024-07-02",
      ["2024-07-01"],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toBe("absent");
  });

  it("returns null for a Friday (excluded)", () => {
    // 2024-07-05 is Friday
    const result = computeDayAttendance(
      "2024-07-05",
      [],
      baseCtx(),
      "2024-07-10",
    );
    expect(result).toBeNull();
  });

  it("returns null for a date before enrollment", () => {
    const result = computeDayAttendance(
      "2024-06-30",
      [],
      baseCtx({ enrollmentDate: "2024-07-01" }),
      "2024-07-04",
    );
    expect(result).toBeNull();
  });

  it("returns null for a date after today", () => {
    const result = computeDayAttendance(
      "2024-07-05",
      [],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toBeNull();
  });

  it("returns null for a date in a paused period", () => {
    const ctx = baseCtx({ status: "paused", statusSince: "2024-07-05" });
    const result = computeDayAttendance("2024-07-06", [], ctx, "2024-07-10");
    expect(result).toBeNull();
  });

  it("returns null for a date after withdrawal", () => {
    const ctx = baseCtx({ status: "withdrawn", statusSince: "2024-07-05" });
    const result = computeDayAttendance("2024-07-06", [], ctx, "2024-07-10");
    expect(result).toBeNull();
  });
});
