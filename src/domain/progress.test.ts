import { describe, it, expect } from "vitest";
import {
  computeJuzProgressPure,
  computeJuzProgressDetailedPure,
  type BoundaryRow,
  type SessionRow,
  type DetailedSessionRow,
  type InitialMemRow,
  type IjazaRow,
} from "./progress";

// Mock data for boundaries (Juz 1, 2, 3 boundaries for Al-Baqarah)
const mockBoundaries: BoundaryRow[] = [
  { juz_number: 1, surah_id: 1, from_ayah: 1, to_ayah: 7 }, // Fatiha
  { juz_number: 1, surah_id: 2, from_ayah: 1, to_ayah: 141 }, // Al-Baqarah start in Juz 1
  { juz_number: 2, surah_id: 2, from_ayah: 142, to_ayah: 252 }, // Al-Baqarah in Juz 2
  { juz_number: 3, surah_id: 2, from_ayah: 253, to_ayah: 286 }, // Al-Baqarah end in Juz 3
  { juz_number: 3, surah_id: 3, from_ayah: 1, to_ayah: 92 }, // Al-Imran start in Juz 3
];

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
});
