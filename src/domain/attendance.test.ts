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
  it("only includes days with sessions (present days)", () => {
    // 2024-07-01 (Mon) -> present, 02 (Tue) -> no session (skipped), 03 (Wed) -> present, 04 (Thu) -> no session (skipped)
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-03"],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toEqual([
      { date: "2024-07-01", status: "present" },
      { date: "2024-07-03", status: "present" },
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
    expect(dates).toEqual(["2024-07-06"]);
  });

  it("returns empty array when no sessions", () => {
    const result = computeAttendanceCalendar([], baseCtx(), "2024-07-03");
    expect(result).toEqual([]);
  });

  it("single day range with a session", () => {
    const result = computeAttendanceCalendar(["2024-07-01"], baseCtx(), "2024-07-01");
    expect(result).toEqual([{ date: "2024-07-01", status: "present" }]);
  });

  it("multiple sessions on same day still yields a single present entry", () => {
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-01", "2024-07-02"],
      baseCtx(),
      "2024-07-03",
    );
    expect(result).toEqual([
      { date: "2024-07-01", status: "present" },
      { date: "2024-07-02", status: "present" },
    ]);
  });

  it("paused student: skips paused period entirely", () => {
    // Paused from 2024-07-05; no entries from that date onward.
    const ctx = baseCtx({ status: "paused", statusSince: "2024-07-05" });
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-03", "2024-07-07"],
      ctx,
      "2024-07-10",
    );
    const dates = result.map((d) => d.date);
    expect(dates).toEqual(["2024-07-01", "2024-07-03"]);
    // No entries from the paused period
    expect(dates).not.toContain("2024-07-05");
    expect(dates).not.toContain("2024-07-07");
    expect(dates).not.toContain("2024-07-10");
  });

  it("withdrawn student: calendar stops at statusSince", () => {
    // Withdrawn on 2024-07-05; no entries from that date onward.
    const ctx = baseCtx({ status: "withdrawn", statusSince: "2024-07-05" });
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-06"],
      ctx,
      "2024-07-10",
    );
    const dates = result.map((d) => d.date);
    expect(dates).toEqual(["2024-07-01"]);
    expect(dates).not.toContain("2024-07-05");
    expect(dates).not.toContain("2024-07-06");
  });

  it("graduated student: calendar stops at statusSince", () => {
    const ctx = baseCtx({ status: "graduated", statusSince: "2024-07-03" });
    const result = computeAttendanceCalendar(
      ["2024-07-01", "2024-07-03", "2024-07-04"],
      ctx,
      "2024-07-10",
    );
    const dates = result.map((d) => d.date);
    expect(dates).toEqual(["2024-07-01"]);
  });
});

describe("computeDayAttendance (incremental)", () => {
  it("returns present when a session exists on that date", () => {
    const result = computeDayAttendance(
      "2024-07-01",
      ["2024-07-01"],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toBe("present");
  });

  it("returns null when no session on that date (no absence tracking)", () => {
    const result = computeDayAttendance(
      "2024-07-02",
      ["2024-07-01"],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toBeNull();
  });

  it("returns null for a Friday (excluded)", () => {
    // 2024-07-05 is Friday
    const result = computeDayAttendance(
      "2024-07-05",
      ["2024-07-05"],
      baseCtx(),
      "2024-07-10",
    );
    expect(result).toBeNull();
  });

  it("returns null for a date before enrollment", () => {
    const result = computeDayAttendance(
      "2024-06-30",
      ["2024-06-30"],
      baseCtx({ enrollmentDate: "2024-07-01" }),
      "2024-07-04",
    );
    expect(result).toBeNull();
  });

  it("returns null for a date after today", () => {
    const result = computeDayAttendance(
      "2024-07-05",
      ["2024-07-05"],
      baseCtx(),
      "2024-07-04",
    );
    expect(result).toBeNull();
  });

  it("returns null for a date in a paused period", () => {
    const ctx = baseCtx({ status: "paused", statusSince: "2024-07-05" });
    const result = computeDayAttendance("2024-07-06", ["2024-07-06"], ctx, "2024-07-10");
    expect(result).toBeNull();
  });

  it("returns null for a date after withdrawal", () => {
    const ctx = baseCtx({ status: "withdrawn", statusSince: "2024-07-05" });
    const result = computeDayAttendance("2024-07-06", ["2024-07-06"], ctx, "2024-07-10");
    expect(result).toBeNull();
  });
});
