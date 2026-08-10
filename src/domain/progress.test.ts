import { describe, it, expect } from "vitest";
import {
  computeJuzProgressPure,
  computeJuzProgressDetailedPure,
  type BoundaryRow,
  type SessionRow,
  type DetailedSessionRow,
  type InitialMemRow,
  type IjazaRow,
  type JuzPageRow,
} from "./progress";

// Mock data for boundaries (Juz 1, 2, 3 boundaries for Al-Baqarah)
const mockBoundaries: BoundaryRow[] = [
  { juz_number: 1, surah_id: 1, from_ayah: 1, to_ayah: 7 }, // Fatiha
  { juz_number: 1, surah_id: 2, from_ayah: 1, to_ayah: 141 }, // Al-Baqarah start in Juz 1
  { juz_number: 2, surah_id: 2, from_ayah: 142, to_ayah: 252 }, // Al-Baqarah in Juz 2
  { juz_number: 3, surah_id: 2, from_ayah: 253, to_ayah: 286 }, // Al-Baqarah end in Juz 3
  { juz_number: 3, surah_id: 3, from_ayah: 1, to_ayah: 92 }, // Al-Imran start in Juz 3
];

// Mock juz_pages for Juz 1: 20 pages covering 148 ayahs (Fatiha 1-7 + Baqarah 1-141)
// Page 1: Fatiha 1-7, Page 2-20: Baqarah split into 19 pages (~7.4 ayahs/page)
// For test simplicity: page 1 = Fatiha (7 ayahs), pages 2-20 = Baqarah 1-141 split evenly
// 141 / 19 ≈ 7.42 → pages 2-8 = 8 ayahs each (56), pages 9-20 = 85/12 ≈ 7.08 → use 7-8 split
// Simpler: 10 pages = 74 ayahs (50%), 15 pages = 111 ayahs (75%)
const mockJuzPages: JuzPageRow[] = [
  // Page 1: Fatiha (7 ayahs)
  { juz_number: 1, page_number: 1, surah_id: 1, from_ayah: 1, to_ayah: 7 },
  // Pages 2-20: Baqarah 1-141 split across 19 pages
  // 141 ayahs / 19 pages: pages 2-9 = 8 ayahs (64), pages 10-20 = 77/11 = 7 each
  { juz_number: 1, page_number: 2, surah_id: 2, from_ayah: 1, to_ayah: 8 },
  { juz_number: 1, page_number: 3, surah_id: 2, from_ayah: 9, to_ayah: 16 },
  { juz_number: 1, page_number: 4, surah_id: 2, from_ayah: 17, to_ayah: 24 },
  { juz_number: 1, page_number: 5, surah_id: 2, from_ayah: 25, to_ayah: 32 },
  { juz_number: 1, page_number: 6, surah_id: 2, from_ayah: 33, to_ayah: 40 },
  { juz_number: 1, page_number: 7, surah_id: 2, from_ayah: 41, to_ayah: 48 },
  { juz_number: 1, page_number: 8, surah_id: 2, from_ayah: 49, to_ayah: 56 },
  { juz_number: 1, page_number: 9, surah_id: 2, from_ayah: 57, to_ayah: 64 },
  { juz_number: 1, page_number: 10, surah_id: 2, from_ayah: 65, to_ayah: 71 },
  { juz_number: 1, page_number: 11, surah_id: 2, from_ayah: 72, to_ayah: 78 },
  { juz_number: 1, page_number: 12, surah_id: 2, from_ayah: 79, to_ayah: 85 },
  { juz_number: 1, page_number: 13, surah_id: 2, from_ayah: 86, to_ayah: 92 },
  { juz_number: 1, page_number: 14, surah_id: 2, from_ayah: 93, to_ayah: 99 },
  { juz_number: 1, page_number: 15, surah_id: 2, from_ayah: 100, to_ayah: 106 },
  { juz_number: 1, page_number: 16, surah_id: 2, from_ayah: 107, to_ayah: 113 },
  { juz_number: 1, page_number: 17, surah_id: 2, from_ayah: 114, to_ayah: 120 },
  { juz_number: 1, page_number: 18, surah_id: 2, from_ayah: 121, to_ayah: 127 },
  { juz_number: 1, page_number: 19, surah_id: 2, from_ayah: 128, to_ayah: 134 },
  { juz_number: 1, page_number: 20, surah_id: 2, from_ayah: 135, to_ayah: 141 },
];
// Verify: 7 + (8*8) + (7*11) = 7 + 64 + 77 = 148 ✓
// 10 pages: 7 + (8*8) + 7 = 78 → 78/148 = 52.7%
// 15 pages: 7 + (8*8) + (7*6) = 7 + 64 + 42 = 113 → 113/148 = 76.4%
// 5 pages: 7 + (8*4) = 7 + 32 = 39 → 39/148 = 26.4%

describe("computeJuzProgressPure", () => {
  it("initial memorization covers a juz fully with Blue color", () => {
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized" }];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(100);
    expect(juz1!.color).toBe("blue");
  });

  it("partial initial memorization (10/20 pages) gives exact 52.7% coverage with juz_pages", () => {
    // 10 pages: 7 (Fatiha) + 64 (Baqarah 1-64) + 7 (Baqarah 65-71) = 78 ayahs → 78/148 = 52.7%
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized", pages: 10 }];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
      juzPages: mockJuzPages,
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(52.7);
    expect(juz1!.color).toBe("yellow");
  });

  it("partial initial memorization (15/20 pages) gives exact 76.4% coverage (Blue)", () => {
    // 15 pages: 7 + 64 + 42 (Baqarah 65-106) = 113 ayahs → 113/148 = 76.4%
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized", pages: 15 }];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
      juzPages: mockJuzPages,
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(76.4);
    expect(juz1!.color).toBe("blue");
  });

  it("partial initial memorization (5/20 pages) gives exact 26.4% coverage", () => {
    // 5 pages: 7 (Fatiha) + 32 (Baqarah 1-32) = 39 ayahs → 39/148 = 26.4%
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized", pages: 5 }];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
      juzPages: mockJuzPages,
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(26.4);
    expect(juz1!.color).toBe("yellow");
  });

  it("session coverage can exceed partial initial memorization coverage", () => {
    // Init mem: 5 pages = 39 ayahs (Fatiha + Baqarah 1-32)
    // Session: Baqarah 1..100 = 100 ayahs in juz 1
    // Max(100, 39) = 100 covered → 100/148 = 67.6%
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized", pages: 5 }];
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "new_memorization", surah_id: 2, from_ayah: 1, to_ayah: 100, rating: "excellent" },
    ];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem,
      ijazat: [],
      juzPages: mockJuzPages,
      referenceDate: new Date("2026-06-27"),
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(67.6);
  });

  it("partial init mem without juz_pages falls back to proportional estimate", () => {
    // No juzPages provided → fallback to N/20 proportional estimate
    // 10/20 * 148 = 74 → 74/148 = 50%
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized", pages: 10 }];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(50);
  });

  it("partial initial memorization with null pages = full juz (100%)", () => {
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized", pages: null }];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(100);
    expect(juz1!.color).toBe("blue");
  });

  it("unions overlapping review ranges correctly (81.1% Blue)", () => {
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "review", surah_id: 2, from_ayah: 1, to_ayah: 100, rating: "excellent" },
      { session_date: "2026-06-26", session_type: "review", surah_id: 2, from_ayah: 50, to_ayah: 120, rating: "excellent" },
    ];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      referenceDate: new Date("2026-06-27"),
    });
    // Total ayahs in Juz 1: 7 (Fatiha) + 141 (Baqarah part) = 148 ayahs
    // Covered: 120 (Baqarah 1..120). Fatiha is 0.
    // Coverage = 120 / 148 * 100 = 81.08% -> 81.1%
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1).toBeDefined();
    expect(juz1!.coveragePercent).toBe(81.1);
    expect(juz1!.color).toBe("blue");
  });

  it("handles a surah spanning multiple juz (Al-Baqarah across juz 1-3)", () => {
    // Session covering Al-Baqarah 140..260 (crosses Juz 1, Juz 2 and Juz 3)
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "review", surah_id: 2, from_ayah: 140, to_ayah: 260, rating: "excellent" },
    ];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      referenceDate: new Date("2026-06-27"),
    });
    const juz1 = progress.find((p) => p.juz === 1); // 2 covered out of 148 -> 1.4% (yellow)
    const juz2 = progress.find((p) => p.juz === 2); // 111 covered out of 111 -> 100% (blue)
    const juz3 = progress.find((p) => p.juz === 3); // 8 covered out of 126 -> 6.3% (yellow)
    expect(juz1!.coveragePercent).toBe(1.4);
    expect(juz1!.color).toBe("yellow");
    expect(juz2!.coveragePercent).toBe(100);
    expect(juz2!.color).toBe("blue");
    expect(juz3!.coveragePercent).toBe(6.3);
    expect(juz3!.color).toBe("yellow");
  });

  it("ijaza overrides color to green", () => {
    const ijazat: IjazaRow[] = [{ ijaza_type: "juz", juz_number: 1 }];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem: [],
      ijazat,
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1!.color).toBe("green");
    expect(juz1!.hasIjaza).toBe(true);
  });

  it("weak rating dominant (>= 30% weak) makes 100% coverage yellow", () => {
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "new_memorization", surah_id: 2, from_ayah: 1, to_ayah: 141, rating: "excellent" },
      { session_date: "2026-06-26", session_type: "review", surah_id: 1, from_ayah: 1, to_ayah: 7, rating: "weak" },
    ];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      referenceDate: new Date("2026-06-27"),
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1!.color).toBe("yellow");
    expect(juz1!.coveragePercent).toBe(100);
  });

  it("no session in last 30 days makes 100% coverage yellow", () => {
    const sessions: SessionRow[] = [
      { session_date: "2026-05-25", session_type: "new_memorization", surah_id: 2, from_ayah: 1, to_ayah: 141, rating: "excellent" },
      { session_date: "2026-05-25", session_type: "new_memorization", surah_id: 1, from_ayah: 1, to_ayah: 7, rating: "excellent" },
    ];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      referenceDate: new Date("2026-06-27"), // 33 days later
    });
    const juz1 = progress.find((p) => p.juz === 1);
    expect(juz1!.color).toBe("yellow");
    expect(juz1!.coveragePercent).toBe(100);
  });
});

describe("computeJuzProgressPure — adjacent/overlapping ranges (F3 regression)", () => {
  it("correctly unions adjacent ranges (1-50 and 51-100 → 100 ayahs)", () => {
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "new_memorization", surah_id: 2, from_ayah: 1, to_ayah: 50, rating: "excellent" },
      { session_date: "2026-06-26", session_type: "new_memorization", surah_id: 2, from_ayah: 51, to_ayah: 100, rating: "excellent" },
    ];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      referenceDate: new Date("2026-06-27"),
    });
    const juz1 = progress.find((p) => p.juz === 1);
    // 100 ayahs covered out of 148 total → 67.6%
    expect(juz1!.coveragePercent).toBe(67.6);
  });

  it("correctly unions fully overlapping ranges (no double-counting)", () => {
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "review", surah_id: 2, from_ayah: 1, to_ayah: 100, rating: "excellent" },
      { session_date: "2026-06-26", session_type: "review", surah_id: 2, from_ayah: 1, to_ayah: 100, rating: "excellent" },
    ];
    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      referenceDate: new Date("2026-06-27"),
    });
    const juz1 = progress.find((p) => p.juz === 1);
    // 100 ayahs covered (not 200) out of 148 → 67.6%
    expect(juz1!.coveragePercent).toBe(67.6);
  });
});

describe("computeJuzProgressDetailedPure", () => {
  const surahMap = new Map<number, string>([
    [1, "الفاتحة"],
    [2, "البقرة"],
    [3, "آل عمران"],
  ]);

  it("returns 30 juz entries with surahs and sessions arrays", () => {
    const result = computeJuzProgressDetailedPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem: [],
      ijazat: [],
      surahMap,
    });
    expect(result).toHaveLength(30);
    expect(result[0].surahs).toBeDefined();
    expect(result[0].sessions).toBeDefined();
    expect(result[0].lastSessionDate).toBeNull();
  });

  it("includes per-surah coverage breakdown", () => {
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized" }];
    const result = computeJuzProgressDetailedPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
      surahMap,
    });
    const juz1 = result.find((p) => p.juz === 1)!;
    expect(juz1.surahs.length).toBeGreaterThan(0);
    // Fatiha (surah 1) should be fully covered
    const fatiha = juz1.surahs.find((s) => s.surah_id === 1);
    expect(fatiha).toBeDefined();
    expect(fatiha!.covered_ayahs).toBe(7);
    expect(fatiha!.total_ayahs).toBe(7);
    expect(fatiha!.coverage_percent).toBe(100);
    expect(fatiha!.surah_name).toBe("الفاتحة");
  });

  it("lists sessions intersecting the juz", () => {
    const sessions: DetailedSessionRow[] = [
      {
        id: "sess1",
        session_date: "2026-06-25",
        session_type: "new_memorization",
        surah_id: 2,
        from_ayah: 1,
        to_ayah: 50,
        rating: "excellent",
        notes: "جيد",
        teacher_name: "أحمد",
      },
    ];
    const result = computeJuzProgressDetailedPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      surahMap,
      referenceDate: new Date("2026-06-27"),
    });
    const juz1 = result.find((p) => p.juz === 1)!;
    expect(juz1.sessions).toHaveLength(1);
    expect(juz1.sessions[0].id).toBe("sess1");
    expect(juz1.sessions[0].surah_name).toBe("البقرة");
    expect(juz1.sessions[0].teacher_name).toBe("أحمد");
    expect(juz1.lastSessionDate).toBe("2026-06-25");
  });

  it("deduplicates sessions that intersect multiple segments", () => {
    const sessions: DetailedSessionRow[] = [
      {
        id: "sess1",
        session_date: "2026-06-25",
        session_type: "review",
        surah_id: 2,
        from_ayah: 1,
        to_ayah: 200,
        rating: "good",
        notes: null,
        teacher_name: "أحمد",
      },
    ];
    const result = computeJuzProgressDetailedPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem: [],
      ijazat: [],
      surahMap,
      referenceDate: new Date("2026-06-27"),
    });
    // This session intersects both juz 1 and juz 2 (Baqarah spans both)
    const juz1 = result.find((p) => p.juz === 1)!;
    expect(juz1.sessions).toHaveLength(1); // not duplicated
  });

  it("full_quran ijaza makes all juz with boundaries green", () => {
    const ijazat: IjazaRow[] = [{ ijaza_type: "full_quran", juz_number: null }];
    const result = computeJuzProgressDetailedPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem: [],
      ijazat,
      surahMap,
    });
    // Juz 1-3 have boundaries in mock data; the rest are gray (no segments).
    const juz1 = result.find((p) => p.juz === 1)!;
    const juz2 = result.find((p) => p.juz === 2)!;
    const juz3 = result.find((p) => p.juz === 3)!;
    expect(juz1.color).toBe("green");
    expect(juz1.hasIjaza).toBe(true);
    expect(juz2.color).toBe("green");
    expect(juz2.hasIjaza).toBe(true);
    expect(juz3.color).toBe("green");
    expect(juz3.hasIjaza).toBe(true);
  });

  it("partial init mem with juz_pages shows accurate per-surah coverage", () => {
    // 10 pages: Fatiha (7) + Baqarah 1-71 = 78 ayahs → 52.7% of juz 1
    const initialMem: InitialMemRow[] = [{ juz_number: 1, status: "memorized", pages: 10 }];
    const result = computeJuzProgressDetailedPure({
      boundaries: mockBoundaries,
      sessions: [],
      initialMem,
      ijazat: [],
      juzPages: mockJuzPages,
      surahMap,
    });
    const juz1 = result.find((p) => p.juz === 1)!;
    expect(juz1.coveragePercent).toBe(52.7);

    // Fatiha: fully covered (7/7 = 100%)
    const fatiha = juz1.surahs.find((s) => s.surah_id === 1)!;
    expect(fatiha.covered_ayahs).toBe(7);
    expect(fatiha.coverage_percent).toBe(100);

    // Baqarah in juz 1: 71 out of 141 ayahs covered = 50.4%
    const baqarah = juz1.surahs.find((s) => s.surah_id === 2)!;
    expect(baqarah.covered_ayahs).toBe(71);
    expect(baqarah.coverage_percent).toBe(50.4);
  });
});
