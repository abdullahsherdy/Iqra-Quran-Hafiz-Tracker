import { computeJuzProgressPure, BoundaryRow, SessionRow, InitialMemRow, IjazaRow } from "./progress";

// Mock data for boundaries (Juz 1, 2, 3 boundaries for Al-Baqarah)
const mockBoundaries: BoundaryRow[] = [
  { juz_number: 1, surah_id: 1, from_ayah: 1, to_ayah: 7 },     // Fatiha
  { juz_number: 1, surah_id: 2, from_ayah: 1, to_ayah: 141 },   // Al-Baqarah start in Juz 1
  { juz_number: 2, surah_id: 2, from_ayah: 142, to_ayah: 252 }, // Al-Baqarah in Juz 2
  { juz_number: 3, surah_id: 2, from_ayah: 253, to_ayah: 286 }, // Al-Baqarah end in Juz 3
  { juz_number: 3, surah_id: 3, from_ayah: 1, to_ayah: 92 },    // Al-Imran start in Juz 3
];

function runTests() {
  console.log("Running computeJuzProgress tests...");

  // Test Case 1: Initial Memorization covers Juz 1 fully
  {
    const initialMem: InitialMemRow[] = [
      { juz_number: 1, status: "memorized" }
    ];
    const sessions: SessionRow[] = [];
    const ijazat: IjazaRow[] = [];

    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem,
      ijazat,
    });

    const juz1 = progress.find(p => p.juz === 1);
    if (!juz1 || juz1.coveragePercent !== 100 || juz1.color !== "blue") {
      console.error("❌ Test Case 1 Failed:", juz1);
      process.exit(1);
    }
    console.log("✅ Test Case 1 Passed: Initial memorization covers Juz 1 fully with Blue color.");
  }

  // Test Case 2: Overlapping review ranges
  {
    const initialMem: InitialMemRow[] = [];
    // Session 1: Al-Baqarah 1..100
    // Session 2: Al-Baqarah 50..120 (overlap)
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "review", surah_id: 2, from_ayah: 1, to_ayah: 100, rating: "excellent" },
      { session_date: "2026-06-26", session_type: "review", surah_id: 2, from_ayah: 50, to_ayah: 120, rating: "excellent" }
    ];
    const ijazat: IjazaRow[] = [];

    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem,
      ijazat,
      referenceDate: new Date("2026-06-27")
    });

    // Total ayahs in Juz 1: 7 (Fatiha) + 141 (Baqarah part) = 148 ayahs
    // Covered: 120 (Baqarah 1..120). Fatiha is 0.
    // Coverage should be 120 / 148 * 100 = 81.08% -> 81.1%
    const juz1 = progress.find(p => p.juz === 1);
    if (!juz1 || juz1.coveragePercent !== 81.1 || juz1.color !== "blue") {
      console.error("❌ Test Case 2 Failed:", juz1);
      process.exit(1);
    }
    console.log("✅ Test Case 2 Passed: Overlapping review ranges correctly unioned to 81.1% (Blue).");
  }

  // Test Case 3: Surah spanning multiple juz (Al-Baqarah across juz 1-3)
  {
    const initialMem: InitialMemRow[] = [];
    // Session covering Al-Baqarah 140..260 (crosses Juz 1, Juz 2 and Juz 3)
    // Juz 1: intersects 140..141 (2 ayahs)
    // Juz 2: intersects 142..252 (111 ayahs - fully covered)
    // Juz 3: intersects 253..260 (8 ayahs)
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "review", surah_id: 2, from_ayah: 140, to_ayah: 260, rating: "excellent" }
    ];
    const ijazat: IjazaRow[] = [];

    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem,
      ijazat,
      referenceDate: new Date("2026-06-27")
    });

    const juz1 = progress.find(p => p.juz === 1); // 2 covered out of 148 -> 1.4% (yellow)
    const juz2 = progress.find(p => p.juz === 2); // 111 covered out of 111 -> 100% (blue)
    const juz3 = progress.find(p => p.juz === 3); // 8 covered out of 126 (34 Baqarah + 92 Imran) -> 6.3% (yellow)

    if (!juz1 || juz1.coveragePercent !== 1.4 || juz1.color !== "yellow") {
      console.error("❌ Test Case 3 (Juz 1) Failed:", juz1);
      process.exit(1);
    }
    if (!juz2 || juz2.coveragePercent !== 100 || juz2.color !== "blue") {
      console.error("❌ Test Case 3 (Juz 2) Failed:", juz2);
      process.exit(1);
    }
    if (!juz3 || juz3.coveragePercent !== 6.3 || juz3.color !== "yellow") {
      console.error("❌ Test Case 3 (Juz 3) Failed:", juz3);
      process.exit(1);
    }
    console.log("✅ Test Case 3 Passed: Spanning multiple juz correctly calculated.");
  }

  // Test Case 4: Ijaza overriding color to green
  {
    const initialMem: InitialMemRow[] = [];
    const sessions: SessionRow[] = [];
    const ijazat: IjazaRow[] = [
      { ijaza_type: "juz", juz_number: 1 }
    ];

    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem,
      ijazat,
    });

    const juz1 = progress.find(p => p.juz === 1);
    if (!juz1 || juz1.color !== "green" || !juz1.hasIjaza) {
      console.error("❌ Test Case 4 Failed:", juz1);
      process.exit(1);
    }
    console.log("✅ Test Case 4 Passed: Ijaza overrides color to Green.");
  }

  // Test Case 5: Weak rating dominant (>= 30% weak) makes color yellow
  {
    const initialMem: InitialMemRow[] = [];
    // Session 1: Al-Baqarah 1..141 (excellent)
    // Session 2: Fatiha 1..7 (weak)
    // Total sessions = 2, weak sessions = 1 (50% >= 30%)
    // Coverage is 100% of Juz 1 (7 + 141 = 148 ayahs)
    const sessions: SessionRow[] = [
      { session_date: "2026-06-25", session_type: "new_memorization", surah_id: 2, from_ayah: 1, to_ayah: 141, rating: "excellent" },
      { session_date: "2026-06-26", session_type: "review", surah_id: 1, from_ayah: 1, to_ayah: 7, rating: "weak" }
    ];
    const ijazat: IjazaRow[] = [];

    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem,
      ijazat,
      referenceDate: new Date("2026-06-27")
    });

    const juz1 = progress.find(p => p.juz === 1);
    if (!juz1 || juz1.color !== "yellow" || juz1.coveragePercent !== 100) {
      console.error("❌ Test Case 5 Failed:", juz1);
      process.exit(1);
    }
    console.log("✅ Test Case 5 Passed: Weak rating dominant turns 100% coverage yellow.");
  }

  // Test Case 6: No session in last 30 days makes color yellow
  {
    const initialMem: InitialMemRow[] = [];
    // Session is 31 days ago
    const sessions: SessionRow[] = [
      { session_date: "2026-05-25", session_type: "new_memorization", surah_id: 2, from_ayah: 1, to_ayah: 141, rating: "excellent" },
      { session_date: "2026-05-25", session_type: "new_memorization", surah_id: 1, from_ayah: 1, to_ayah: 7, rating: "excellent" }
    ];
    const ijazat: IjazaRow[] = [];

    const progress = computeJuzProgressPure({
      boundaries: mockBoundaries,
      sessions,
      initialMem,
      ijazat,
      referenceDate: new Date("2026-06-27") // difference is 33 days
    });

    const juz1 = progress.find(p => p.juz === 1);
    if (!juz1 || juz1.color !== "yellow" || juz1.coveragePercent !== 100) {
      console.error("❌ Test Case 6 Failed:", juz1);
      process.exit(1);
    }
    console.log("✅ Test Case 6 Passed: No session in last 30 days turns 100% coverage yellow.");
  }

  console.log("🎉 All computeJuzProgress unit tests passed successfully!");
}

runTests();
