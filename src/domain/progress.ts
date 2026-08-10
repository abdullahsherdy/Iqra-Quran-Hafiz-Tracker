/**
 * Pure juz-progress computation — no I/O, no Drizzle, no Supabase.
 *
 * `computeJuzProgressPure` and `computeJuzProgressDetailedPure` are the
 * pure functions exercised by unit tests. The DB-fetching shell
 * (`computeJuzProgress`) lives in `features/students/server/progress.ts`.
 */

export interface JuzProgress {
  juz: number;
  coveragePercent: number;
  color: "green" | "blue" | "yellow" | "gray";
  hasIjaza: boolean;
}

/** Per-surah coverage breakdown within a juz (DRY-2). */
export interface SurahCoverage {
  surah_id: number;
  surah_name: string;
  total_ayahs: number;
  covered_ayahs: number;
  coverage_percent: number;
}

/** A session intersecting a juz, with display fields (DRY-2, fixes E3 `any[]`). */
export interface JuzSessionDetail {
  id: string;
  session_date: string;
  session_type: string;
  rating: string;
  notes: string | null;
  from_ayah: number;
  to_ayah: number;
  surah_name: string;
  teacher_name: string;
}

/** Detailed juz progress = summary + per-surah breakdown + per-juz sessions. */
export interface JuzProgressDetailed extends JuzProgress {
  surahs: SurahCoverage[];
  sessions: JuzSessionDetail[];
  lastSessionDate: string | null;
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

/** Extended session row carrying the extra fields the detailed view needs. */
export interface DetailedSessionRow extends SessionRow {
  id: string;
  notes: string | null;
  teacher_name: string;
}

export interface InitialMemRow {
  juz_number: number;
  status: string;
  /** Pages memorized in this juz (Hafs Madani mushaf). null/undefined = full juz. */
  pages?: number | null;
}

/** Page-level breakdown of a juz (from the juz_pages table). */
export interface JuzPageRow {
  juz_number: number;
  page_number: number;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
}

export interface IjazaRow {
  ijaza_type: string;
  juz_number: number | null;
}

// --- Range helpers (A5/A6: extracted to eliminate duplication) ---

/** Group items by a key into a Map. */
function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    let list = map.get(keyFn(item));
    if (!list) {
      list = [];
      map.set(keyFn(item), list);
    }
    list.push(item);
  }
  return map;
}

/** Intersect two [from, to] ranges. Returns null if they don't overlap. */
function intersectRanges(
  fromA: number, toA: number,
  fromB: number, toB: number,
): [number, number] | null {
  const start = Math.max(fromA, fromB);
  const end = Math.min(toA, toB);
  return start <= end ? [start, end] : null;
}

/** Sort and merge overlapping/adjacent [from, to] ranges into a union. */
function unionRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return [];
  ranges.sort((a, b) => a[0] - b[0]);
  const unioned: [number, number][] = [];
  let curStart = ranges[0][0];
  let curEnd = ranges[0][1];
  for (let i = 1; i < ranges.length; i++) {
    const [nextStart, nextEnd] = ranges[i];
    if (nextStart <= curEnd + 1) {
      curEnd = Math.max(curEnd, nextEnd);
    } else {
      unioned.push([curStart, curEnd]);
      curStart = nextStart;
      curEnd = nextEnd;
    }
  }
  unioned.push([curStart, curEnd]);
  return unioned;
}

/** Sum the lengths of a list of [from, to] ranges. */
function sumRangeLengths(ranges: [number, number][]): number {
  let total = 0;
  for (const [f, t] of ranges) {
    total += t - f + 1;
  }
  return total;
}

export function computeJuzProgressPure(params: {
  boundaries: BoundaryRow[];
  sessions: SessionRow[];
  initialMem: InitialMemRow[];
  ijazat: IjazaRow[];
  juzPages?: JuzPageRow[];
  referenceDate?: Date;
}): JuzProgress[] {
  const { boundaries, sessions, initialMem, ijazat, juzPages = [], referenceDate = new Date() } = params;

  // 1. Map initial memorization status + pages
  const initMemMap = new Map<number, { status: string; pages: number | null }>();
  for (const row of initialMem) {
    initMemMap.set(row.juz_number, {
      status: row.status,
      pages: row.pages ?? null,
    });
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
  for (const [juzNum, info] of initMemMap.entries()) {
    if (info.status === "with_ijaza") {
      ijazaJuzs.add(juzNum);
    }
  }

  const result: JuzProgress[] = [];

  // Group boundaries by juz
  const boundariesByJuz = groupBy(boundaries, (r) => r.juz_number);

  // Group juz_pages by juz → page_number → surah rows
  const juzPagesByJuz = new Map<number, Map<number, JuzPageRow[]>>();
  for (const page of juzPages) {
    let pageMap = juzPagesByJuz.get(page.juz_number);
    if (!pageMap) {
      pageMap = new Map();
      juzPagesByJuz.set(page.juz_number, pageMap);
    }
    let surahRows = pageMap.get(page.page_number);
    if (!surahRows) {
      surahRows = [];
      pageMap.set(page.page_number, surahRows);
    }
    surahRows.push(page);
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

    // Initial memorization info for this juz
    const initMemInfo = initMemMap.get(juz);
    // Full initial memorization (pages = null/undefined) → all segments covered
    const isFullyInitMem = initMemInfo && initMemInfo.pages === null;
    // Partial initial memorization (pages = N) → proportional coverage
    const isPartialInitMem = initMemInfo && initMemInfo.pages !== null;

    for (const seg of segments) {
      if (isFullyInitMem) {
        // Full juz memorized before joining — all segments covered
        addCoveredRange(seg.surah_id, seg.from_ayah, seg.to_ayah);
      } else {
        // Find intersecting sessions (also applies when partial init mem —
        // sessions can add coverage on top of the partial initial memorization)
        const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
        for (const sess of surahSessions) {
          const overlap = intersectRanges(sess.from_ayah, sess.to_ayah, seg.from_ayah, seg.to_ayah);
          if (overlap) {
            addCoveredRange(seg.surah_id, overlap[0], overlap[1]);
          }
        }
      }
    }

    // Session-based covered ayahs
    let sessionCoveredAyahs = 0;
    for (const [, ranges] of coveredRangesBySurah.entries()) {
      if (ranges.length === 0) continue;
      sessionCoveredAyahs += sumRangeLengths(unionRanges(ranges));
    }

    // For partial initial memorization, compute exact ayah-level coverage
    // using the juz_pages table (first N pages of the juz).
    // Overall coverage = max(session coverage, init-mem page coverage).
    let totalCoveredAyahs = sessionCoveredAyahs;
    if (isPartialInitMem && initMemInfo?.pages !== null && initMemInfo.pages !== undefined && juzTotalAyahs > 0) {
      const pageMap = juzPagesByJuz.get(juz);
      if (pageMap) {
        // Collect ayah ranges from the first N pages
        const initMemRangesBySurah = new Map<number, [number, number][]>();
        for (let p = 1; p <= initMemInfo.pages; p++) {
          const pageRows = pageMap.get(p);
          if (!pageRows) continue;
          for (const pr of pageRows) {
            let ranges = initMemRangesBySurah.get(pr.surah_id);
            if (!ranges) {
              ranges = [];
              initMemRangesBySurah.set(pr.surah_id, ranges);
            }
            ranges.push([pr.from_ayah, pr.to_ayah]);
          }
        }
        let initMemCoveredAyahs = 0;
        for (const [, ranges] of initMemRangesBySurah.entries()) {
          initMemCoveredAyahs += sumRangeLengths(unionRanges(ranges));
        }
        totalCoveredAyahs = Math.max(totalCoveredAyahs, initMemCoveredAyahs);
      } else {
        // Fallback: no juz_pages data for this juz, use proportional estimate
        const totalPages = 20; // most juz have 20 pages
        totalCoveredAyahs = Math.max(totalCoveredAyahs, (initMemInfo.pages / totalPages) * juzTotalAyahs);
      }
    }

    const coveragePercent = juzTotalAyahs > 0 ? (totalCoveredAyahs / juzTotalAyahs) * 100 : 0;

    // Find sessions intersecting with this juz to determine ratings and recency
    const juzSessions: SessionRow[] = [];
    for (const seg of segments) {
      const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
      for (const sess of surahSessions) {
        if (intersectRanges(sess.from_ayah, sess.to_ayah, seg.from_ayah, seg.to_ayah)) {
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

/**
 * Detailed progress: the summary from `computeJuzProgressPure` enriched with
 * per-surah coverage breakdown and per-juz session lists (DRY-2).
 * Pure — no I/O. Fixes E3 (replaces `any[]` in the progress route).
 */
export function computeJuzProgressDetailedPure(params: {
  boundaries: BoundaryRow[];
  sessions: DetailedSessionRow[];
  initialMem: InitialMemRow[];
  ijazat: IjazaRow[];
  juzPages?: JuzPageRow[];
  surahMap: Map<number, string>;
  referenceDate?: Date;
}): JuzProgressDetailed[] {
  const { boundaries, sessions, initialMem, ijazat, juzPages = [], surahMap, referenceDate = new Date() } = params;

  // Reuse the summary computation (strip extra fields for the base function).
  const summary = computeJuzProgressPure({
    boundaries,
    sessions: sessions.map((s) => ({
      session_date: s.session_date,
      session_type: s.session_type,
      surah_id: s.surah_id,
      from_ayah: s.from_ayah,
      to_ayah: s.to_ayah,
      rating: s.rating,
    })),
    initialMem,
    ijazat,
    juzPages,
    referenceDate,
  });

  const initMemMap = new Map<number, { status: string; pages: number | null }>();
  for (const row of initialMem) {
    initMemMap.set(row.juz_number, {
      status: row.status,
      pages: row.pages ?? null,
    });
  }

  const boundariesByJuz = groupBy(boundaries, (r) => r.juz_number);

  // Group juz_pages by juz → page_number → surah rows
  const juzPagesByJuz = new Map<number, Map<number, JuzPageRow[]>>();
  for (const page of juzPages) {
    let pageMap = juzPagesByJuz.get(page.juz_number);
    if (!pageMap) {
      pageMap = new Map();
      juzPagesByJuz.set(page.juz_number, pageMap);
    }
    let surahRows = pageMap.get(page.page_number);
    if (!surahRows) {
      surahRows = [];
      pageMap.set(page.page_number, surahRows);
    }
    surahRows.push(page);
  }

  return summary.map((progress) => {
    const juz = progress.juz;
    const segments = boundariesByJuz.get(juz) ?? [];
    const initMemInfo = initMemMap.get(juz);
    const isFullyInitMem = initMemInfo && initMemInfo.pages === null;
    const isPartialInitMem = initMemInfo && initMemInfo.pages !== null;

    // For partial init mem, collect ayah ranges per surah from the first N pages
    const partialInitMemRangesBySurah = new Map<number, [number, number][]>();
    if (isPartialInitMem && initMemInfo?.pages !== null && initMemInfo.pages !== undefined) {
      const pageMap = juzPagesByJuz.get(juz);
      if (pageMap) {
        for (let p = 1; p <= initMemInfo.pages; p++) {
          const pageRows = pageMap.get(p);
          if (!pageRows) continue;
          for (const pr of pageRows) {
            let ranges = partialInitMemRangesBySurah.get(pr.surah_id);
            if (!ranges) {
              ranges = [];
              partialInitMemRangesBySurah.set(pr.surah_id, ranges);
            }
            ranges.push([pr.from_ayah, pr.to_ayah]);
          }
        }
      }
    }

    // Group segments by surah
    const segmentsBySurah = groupBy(segments, (s) => s.surah_id);

    // Per-surah coverage
    const surahCoverage: SurahCoverage[] = Array.from(segmentsBySurah.entries()).map(
      ([surahId, segs]) => {
        let totalSegAyahs = 0;
        for (const seg of segs) {
          totalSegAyahs += seg.to_ayah - seg.from_ayah + 1;
        }

        const coveredRanges: [number, number][] = [];
        for (const seg of segs) {
          if (isFullyInitMem) {
            coveredRanges.push([seg.from_ayah, seg.to_ayah]);
          } else {
            // Session coverage
            const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
            for (const sess of surahSessions) {
              const overlap = intersectRanges(sess.from_ayah, sess.to_ayah, seg.from_ayah, seg.to_ayah);
              if (overlap) {
                coveredRanges.push(overlap);
              }
            }
            // Partial init mem coverage (intersect page ranges with this segment)
            if (isPartialInitMem) {
              const pageRanges = partialInitMemRangesBySurah.get(surahId) ?? [];
              for (const [pf, pt] of pageRanges) {
                const overlap = intersectRanges(pf, pt, seg.from_ayah, seg.to_ayah);
                if (overlap) {
                  coveredRanges.push(overlap);
                }
              }
            }
          }
        }

        const coveredSegAyahs = sumRangeLengths(unionRanges(coveredRanges));
        const surahPercent = totalSegAyahs > 0 ? (coveredSegAyahs / totalSegAyahs) * 100 : 0;

        return {
          surah_id: surahId,
          surah_name: surahMap.get(surahId) || "",
          total_ayahs: totalSegAyahs,
          covered_ayahs: coveredSegAyahs,
          coverage_percent: Math.round(surahPercent * 10) / 10,
        };
      },
    );

    // Sessions intersecting this juz
    const juzSessionsList: JuzSessionDetail[] = [];
    const seenSessionIds = new Set<string>();
    for (const seg of segments) {
      const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
      for (const sess of surahSessions) {
        if (intersectRanges(sess.from_ayah, sess.to_ayah, seg.from_ayah, seg.to_ayah) && !seenSessionIds.has(sess.id)) {
          seenSessionIds.add(sess.id);
          juzSessionsList.push({
            id: sess.id,
            session_date: sess.session_date,
            session_type: sess.session_type,
            rating: sess.rating,
            notes: sess.notes,
            from_ayah: sess.from_ayah,
            to_ayah: sess.to_ayah,
            surah_name: surahMap.get(sess.surah_id) || "",
            teacher_name: sess.teacher_name,
          });
        }
      }
    }

    juzSessionsList.sort((a, b) => b.session_date.localeCompare(a.session_date));
    const lastSessionDate = juzSessionsList.length > 0 ? juzSessionsList[0].session_date : null;

    return {
      ...progress,
      surahs: surahCoverage,
      sessions: juzSessionsList,
      lastSessionDate,
    };
  });
}
