import { SupabaseClient } from "@supabase/supabase-js";

export interface JuzProgress {
  juz: number;
  coveragePercent: number;
  color: "green" | "blue" | "yellow" | "gray";
  hasIjaza: boolean;
}

export async function computeJuzProgress(
  admin: SupabaseClient,
  studentId: string,
  referenceDate: Date = new Date()
): Promise<JuzProgress[]> {
  const [boundariesRes, sessionsRes, initialMemRes, ijazatRes] = await Promise.all([
    admin
      .from("juz_boundaries")
      .select("juz_number, surah_id, from_ayah, to_ayah"),
    admin
      .from("sessions")
      .select("session_date, session_type, surah_id, from_ayah, to_ayah, rating")
      .eq("student_id", studentId),
    admin
      .from("initial_memorization")
      .select("juz_number, status")
      .eq("student_id", studentId),
    admin
      .from("ijazat")
      .select("ijaza_type, juz_number")
      .eq("student_id", studentId),
  ]);

  if (boundariesRes.error) throw new Error(boundariesRes.error.message);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (initialMemRes.error) throw new Error(initialMemRes.error.message);
  if (ijazatRes.error) throw new Error(ijazatRes.error.message);

  const boundaries = boundariesRes.data;
  const sessions = sessionsRes.data;
  const initialMem = initialMemRes.data;
  const ijazat = ijazatRes.data;

  return computeJuzProgressPure({
    boundaries,
    sessions,
    initialMem,
    ijazat,
    referenceDate
  });
}

export interface BoundaryRow {
  juz_number: number;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
}

export interface SessionRow {
  session_date: string;
  session_type: string;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
  rating: string;
}

export interface InitialMemRow {
  juz_number: number;
  status: string;
}

export interface IjazaRow {
  ijaza_type: string;
  juz_number: number | null;
}

export function computeJuzProgressPure(params: {
  boundaries: BoundaryRow[];
  sessions: SessionRow[];
  initialMem: InitialMemRow[];
  ijazat: IjazaRow[];
  referenceDate?: Date;
}): JuzProgress[] {
  const { boundaries, sessions, initialMem, ijazat, referenceDate = new Date() } = params;

  // 1. Map initial memorization status
  const initMemMap = new Map<number, string>();
  for (const row of initialMem) {
    initMemMap.set(row.juz_number, row.status);
  }

  // 2. Map formal ijazat
  const ijazaJuzs = new Set<number>();
  for (const row of ijazat) {
    if (row.ijaza_type === "full_quran") {
      for (let j = 1; j <= 30; j++) {
        ijazaJuzs.add(j);
      }
    } else if (row.ijaza_type === "juz" && row.juz_number) {
      ijazaJuzs.add(row.juz_number);
    }
  }

  // Also initial memorization with_ijaza counts as ijaza
  for (const [juzNum, status] of initMemMap.entries()) {
    if (status === "with_ijaza") {
      ijazaJuzs.add(juzNum);
    }
  }

  const result: JuzProgress[] = [];

  // Group boundaries by juz
  const boundariesByJuz = new Map<number, BoundaryRow[]>();
  for (const row of boundaries) {
    let list = boundariesByJuz.get(row.juz_number);
    if (!list) {
      list = [];
      boundariesByJuz.set(row.juz_number, list);
    }
    list.push(row);
  }

  for (let juz = 1; juz <= 30; juz++) {
    const segments = boundariesByJuz.get(juz) ?? [];
    if (segments.length === 0) {
      result.push({ juz, coveragePercent: 0, color: "gray", hasIjaza: false });
      continue;
    }

    // Compute total ayahs in this juz
    let juzTotalAyahs = 0;
    for (const seg of segments) {
      juzTotalAyahs += (seg.to_ayah - seg.from_ayah + 1);
    }

    const hasIjaza = ijazaJuzs.has(juz);

    // Group covered ranges by surah
    const coveredRangesBySurah = new Map<number, [number, number][]>();

    // Helper to add a range
    const addCoveredRange = (surahId: number, from: number, to: number) => {
      let ranges = coveredRangesBySurah.get(surahId);
      if (!ranges) {
        ranges = [];
        coveredRangesBySurah.set(surahId, ranges);
      }
      ranges.push([from, to]);
    };

    // If juz is fully covered by initial memorization
    const isInitiallyCovered = initMemMap.has(juz);

    for (const seg of segments) {
      if (isInitiallyCovered) {
        addCoveredRange(seg.surah_id, seg.from_ayah, seg.to_ayah);
      } else {
        // Find intersecting sessions
        const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
        for (const sess of surahSessions) {
          const start = Math.max(sess.from_ayah, seg.from_ayah);
          const end = Math.min(sess.to_ayah, seg.to_ayah);
          if (start <= end) {
            addCoveredRange(seg.surah_id, start, end);
          }
        }
      }
    }

    // Now union covered ranges per surah
    let totalCoveredAyahs = 0;
    for (const [surahId, ranges] of coveredRangesBySurah.entries()) {
      if (ranges.length === 0) continue;

      // Sort by start
      ranges.sort((a, b) => a[0] - b[0]);

      const unioned: [number, number][] = [];
      let current = { ...ranges[0] }; // Use object/array copy to avoid mutating original reference
      let curStart = current[0];
      let curEnd = current[1];

      for (let i = 1; i < ranges.length; i++) {
        const next = ranges[i];
        if (next[0] <= curEnd + 1) {
          // Overlap or adjacent, merge
          curEnd = Math.max(curEnd, next[1]);
        } else {
          unioned.push([curStart, curEnd]);
          curStart = next[0];
          curEnd = next[1];
        }
      }
      unioned.push([curStart, curEnd]);

      // Sum covered ayahs for this surah
      for (const [f, t] of unioned) {
        totalCoveredAyahs += (t - f + 1);
      }
    }

    const coveragePercent = juzTotalAyahs > 0 ? (totalCoveredAyahs / juzTotalAyahs) * 100 : 0;

    // Find sessions intersecting with this juz to determine ratings and recency
    const juzSessions: SessionRow[] = [];
    for (const seg of segments) {
      const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
      for (const sess of surahSessions) {
        const start = Math.max(sess.from_ayah, seg.from_ayah);
        const end = Math.min(sess.to_ayah, seg.to_ayah);
        if (start <= end) {
          juzSessions.push(sess);
        }
      }
    }

    let isWeakDominant = false;
    let hasNoSessionIn30Days = false;

    if (juzSessions.length > 0) {
      const weakCount = juzSessions.filter((s) => s.rating === "weak").length;
      isWeakDominant = (weakCount / juzSessions.length) >= 0.3;

      let latestSessionDateStr = "";
      for (const sess of juzSessions) {
        if (!latestSessionDateStr || sess.session_date > latestSessionDateStr) {
          latestSessionDateStr = sess.session_date;
        }
      }

      if (latestSessionDateStr) {
        const latestDate = new Date(latestSessionDateStr);
        const today = new Date(referenceDate);
        const d1 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const d2 = Date.UTC(latestDate.getFullYear(), latestDate.getMonth(), latestDate.getDate());
        const diffDays = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
        hasNoSessionIn30Days = diffDays > 30;
      }
    }

    let color: "green" | "blue" | "yellow" | "gray" = "gray";
    if (hasIjaza) {
      color = "green";
    } else if (totalCoveredAyahs === 0) {
      color = "gray";
    } else if (coveragePercent >= 70 && !isWeakDominant && !hasNoSessionIn30Days) {
      color = "blue";
    } else {
      color = "yellow";
    }

    result.push({
      juz,
      coveragePercent: Math.round(coveragePercent * 10) / 10,
      color,
      hasIjaza,
    });
  }

  return result;
}
