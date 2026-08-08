/**
 * Spaced Repetition Review Schedule — pure domain logic.
 *
 * Given a target date and the student's new-memorization items, computes
 * which portions should be reviewed on that date using three look-back rules:
 *
 * 1. **1-Day Review (المراجعة القريبة)**: Items memorized 1 day before the target date.
 * 2. **7-Day Review (المراجعة المتوسطة)**: Items memorized 7 days before the target date.
 * 3. **30-Day Review (المراجعة التراكمية)**: Items memorized 30 days before the target date.
 *
 * Only `new_memorization` items trigger scheduled reviews — review sessions
 * themselves don't create new review obligations.
 */

export type ReviewRule = "1-day" | "7-day" | "30-day";

export interface ReviewableItem {
  session_date: string;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
}

export interface ScheduledReview {
  rule: ReviewRule;
  original_date: string;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
}

const REVIEW_INTERVALS: { rule: ReviewRule; days: number }[] = [
  { rule: "1-day", days: 1 },
  { rule: "7-day", days: 7 },
  { rule: "30-day", days: 30 },
];

/**
 * Add N days to a YYYY-MM-DD date string and return the resulting YYYY-MM-DD.
 * Uses UTC to avoid timezone issues.
 */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Compute the review schedule for a target date.
 *
 * For each review interval (1, 7, 30 days), finds new-memorization items
 * whose session_date is exactly that many days before the target date.
 *
 * If the same portion (same surah + ayah range + original date) matches
 * multiple rules, it appears only once under the shortest interval (most recent).
 *
 * @param targetDate The date to compute reviews for (YYYY-MM-DD)
 * @param newMemorizationItems All new_memorization items for the student
 * @returns Scheduled reviews sorted by rule priority (1-day first, then 7-day, then 30-day)
 */
export function computeReviewSchedule(
  targetDate: string,
  newMemorizationItems: ReviewableItem[]
): ScheduledReview[] {
  const seen = new Set<string>();
  const result: ScheduledReview[] = [];

  for (const { rule, days } of REVIEW_INTERVALS) {
    const lookbackDate = addDays(targetDate, -days);

    for (const item of newMemorizationItems) {
      if (item.session_date !== lookbackDate) continue;

      // Deduplicate: same surah + range + original date → skip if already seen
      const key = `${item.surah_id}:${item.from_ayah}-${item.to_ayah}:${item.session_date}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        rule,
        original_date: item.session_date,
        surah_id: item.surah_id,
        from_ayah: item.from_ayah,
        to_ayah: item.to_ayah,
      });
    }
  }

  return result;
}

/**
 * Group scheduled reviews by rule for display.
 */
export function groupReviewsByRule(
  reviews: ScheduledReview[]
): Record<ReviewRule, ScheduledReview[]> {
  return {
    "1-day": reviews.filter((r) => r.rule === "1-day"),
    "7-day": reviews.filter((r) => r.rule === "7-day"),
    "30-day": reviews.filter((r) => r.rule === "30-day"),
  };
}