import { describe, it, expect } from "vitest";
import { computeReviewSchedule, groupReviewsByRule, type ReviewableItem } from "./review";

describe("computeReviewSchedule", () => {
  const items: ReviewableItem[] = [
    { session_date: "2026-07-31", surah_id: 2, from_ayah: 1, to_ayah: 10 },
    { session_date: "2026-07-25", surah_id: 2, from_ayah: 11, to_ayah: 20 },
    { session_date: "2026-07-02", surah_id: 1, from_ayah: 1, to_ayah: 5 },
  ];

  it("returns 1-day review for items from 1 day before target", () => {
    const result = computeReviewSchedule("2026-08-01", items);
    const oneDay = result.filter((r) => r.rule === "1-day");
    expect(oneDay).toHaveLength(1);
    expect(oneDay[0].surah_id).toBe(2);
    expect(oneDay[0].from_ayah).toBe(1);
    expect(oneDay[0].to_ayah).toBe(10);
    expect(oneDay[0].original_date).toBe("2026-07-31");
  });

  it("returns 7-day review for items from 7 days before target", () => {
    const result = computeReviewSchedule("2026-08-01", items);
    const sevenDay = result.filter((r) => r.rule === "7-day");
    expect(sevenDay).toHaveLength(1);
    expect(sevenDay[0].surah_id).toBe(2);
    expect(sevenDay[0].from_ayah).toBe(11);
    expect(sevenDay[0].to_ayah).toBe(20);
    expect(sevenDay[0].original_date).toBe("2026-07-25");
  });

  it("returns 30-day review for items from 30 days before target", () => {
    const result = computeReviewSchedule("2026-08-01", items);
    const thirtyDay = result.filter((r) => r.rule === "30-day");
    expect(thirtyDay).toHaveLength(1);
    expect(thirtyDay[0].surah_id).toBe(1);
    expect(thirtyDay[0].from_ayah).toBe(1);
    expect(thirtyDay[0].to_ayah).toBe(5);
    expect(thirtyDay[0].original_date).toBe("2026-07-02");
  });

  it("returns all three rules sorted by priority (1-day, 7-day, 30-day)", () => {
    const result = computeReviewSchedule("2026-08-01", items);
    expect(result).toHaveLength(3);
    expect(result[0].rule).toBe("1-day");
    expect(result[1].rule).toBe("7-day");
    expect(result[2].rule).toBe("30-day");
  });

  it("returns empty array when no items match", () => {
    const result = computeReviewSchedule("2026-08-01", []);
    expect(result).toEqual([]);
  });

  it("returns empty array when no items match the look-back dates", () => {
    const noMatch: ReviewableItem[] = [
      { session_date: "2026-07-15", surah_id: 1, from_ayah: 1, to_ayah: 5 },
    ];
    const result = computeReviewSchedule("2026-08-01", noMatch);
    expect(result).toEqual([]);
  });

  it("deduplicates items that match multiple rules", () => {
    // An item from 2026-07-01 would match both 7-day (if target is 2026-07-08)
    // and 30-day (if target is 2026-07-31). But for a single target date,
    // an item can only match one rule (since 1, 7, 30 are distinct).
    // Test dedup with same content from same date:
    const dupItems: ReviewableItem[] = [
      { session_date: "2026-07-31", surah_id: 2, from_ayah: 1, to_ayah: 10 },
      { session_date: "2026-07-31", surah_id: 2, from_ayah: 1, to_ayah: 10 }, // exact duplicate
    ];
    const result = computeReviewSchedule("2026-08-01", dupItems);
    expect(result).toHaveLength(1);
  });

  it("handles month boundaries correctly", () => {
    // Aug 1 - 1 day = July 31
    const result = computeReviewSchedule("2026-08-01", [
      { session_date: "2026-07-31", surah_id: 1, from_ayah: 1, to_ayah: 7 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("1-day");
  });

  it("handles year boundaries correctly", () => {
    // Jan 1, 2027 - 1 day = Dec 31, 2026
    const result = computeReviewSchedule("2027-01-01", [
      { session_date: "2026-12-31", surah_id: 1, from_ayah: 1, to_ayah: 7 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("1-day");
    expect(result[0].original_date).toBe("2026-12-31");
  });

  it("handles leap year (Feb 29)", () => {
    // March 1, 2024 - 1 day = Feb 29, 2024 (leap year)
    const result = computeReviewSchedule("2024-03-01", [
      { session_date: "2024-02-29", surah_id: 1, from_ayah: 1, to_ayah: 7 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("1-day");
  });

  it("collects multiple items from the same look-back date", () => {
    const multiItems: ReviewableItem[] = [
      { session_date: "2026-07-31", surah_id: 2, from_ayah: 1, to_ayah: 10 },
      { session_date: "2026-07-31", surah_id: 3, from_ayah: 1, to_ayah: 5 },
      { session_date: "2026-07-31", surah_id: 4, from_ayah: 1, to_ayah: 3 },
    ];
    const result = computeReviewSchedule("2026-08-01", multiItems);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.rule === "1-day")).toBe(true);
  });
});

describe("groupReviewsByRule", () => {
  it("groups reviews by rule", () => {
    const items: ReviewableItem[] = [
      { session_date: "2026-07-31", surah_id: 2, from_ayah: 1, to_ayah: 10 },
      { session_date: "2026-07-25", surah_id: 3, from_ayah: 1, to_ayah: 5 },
      { session_date: "2026-07-02", surah_id: 1, from_ayah: 1, to_ayah: 7 },
    ];
    const reviews = computeReviewSchedule("2026-08-01", items);
    const grouped = groupReviewsByRule(reviews);

    expect(grouped["1-day"]).toHaveLength(1);
    expect(grouped["7-day"]).toHaveLength(1);
    expect(grouped["30-day"]).toHaveLength(1);
  });

  it("returns empty arrays when no reviews", () => {
    const grouped = groupReviewsByRule([]);
    expect(grouped["1-day"]).toEqual([]);
    expect(grouped["7-day"]).toEqual([]);
    expect(grouped["30-day"]).toEqual([]);
  });
});