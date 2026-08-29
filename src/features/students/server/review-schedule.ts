import "server-only";

import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { sessionsTable, sessionItemsTable, surahsTable } from "@/db/schema";
import {
  computeReviewSchedule,
  groupReviewsByRule,
  type ReviewableItem,
} from "@/domain/review";

/**
 * DB-fetching shell for the spaced-repetition review schedule. The pure
 * scheduling logic lives in `computeReviewSchedule`/`groupReviewsByRule`; this
 * shell only fetches the student's items and enriches them with surah names.
 *
 * Single source of truth shared by the staff route
 * (`/api/students/[id]/review`) and the student-portal route
 * (`/api/student/review`).
 */
export async function loadReviewSchedule(
  db: Db,
  studentId: string,
  targetDate: string
) {
  const items = await db
    .select({
      session_date: sessionsTable.session_date,
      session_type: sessionItemsTable.session_type,
      surah_id: sessionItemsTable.surah_id,
      from_ayah: sessionItemsTable.from_ayah,
      to_ayah: sessionItemsTable.to_ayah,
      surah_name: surahsTable.name_arabic,
    })
    .from(sessionItemsTable)
    .innerJoin(sessionsTable, eq(sessionItemsTable.session_id, sessionsTable.id))
    .leftJoin(surahsTable, eq(sessionItemsTable.surah_id, surahsTable.id))
    .where(eq(sessionsTable.student_id, studentId));

  const surahMap = new Map<number, string>();
  for (const i of items) {
    if (i.surah_name) surahMap.set(i.surah_id, i.surah_name);
  }

  const reviewableItems: ReviewableItem[] = items
    .filter((i) => i.session_type === "new_memorization")
    .map((i) => ({
      session_date: i.session_date,
      surah_id: i.surah_id,
      from_ayah: i.from_ayah,
      to_ayah: i.to_ayah,
    }));

  const schedule = computeReviewSchedule(targetDate, reviewableItems);

  const enriched = schedule.map((r) => ({
    ...r,
    surah_name: surahMap.get(r.surah_id) ?? "",
  }));

  const grouped = groupReviewsByRule(enriched);

  return {
    date: targetDate,
    grouped,
    total: enriched.length,
  };
}
