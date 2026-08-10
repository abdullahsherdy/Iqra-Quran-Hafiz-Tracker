/**
 * Pure session validation — no I/O, no Drizzle, no Supabase.
 *
 * A session consists of a parent record (student, date, overall rating, notes)
 * and one or more session items (surah, ayah range, type, rating per item).
 * This allows a single session to include both new memorization and review.
 */

import type { Rating, SessionType } from "./types";

export interface SessionItemPayload {
  session_type: SessionType;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
  rating: Rating;
  pages?: number | null;
  notes?: string | null;
}

export interface SessionPayload {
  student_id: string;
  session_date: string;
  overall_rating: Rating;
  notes?: string | null;
  items: SessionItemPayload[];
}

const SESSION_TYPES: SessionType[] = ["new_memorization", "review"];
const RATINGS: Rating[] = ["excellent", "good", "weak"];

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTES_LENGTH = 2000;

/**
 * Validate a single session item (one Quran portion).
 * Returns the validated item or an error message.
 */
function validateSessionItem(
  item: Record<string, unknown>,
  index: number
): { data: SessionItemPayload } | { error: string } {
  const { session_type, surah_id, from_ayah, to_ayah, rating, pages, notes } = item;

  if (!SESSION_TYPES.includes(session_type as SessionType)) {
    return { error: `العنصر ${index + 1}: يرجى اختيار نوع الجلسة` };
  }

  const surahIdNum = Number(surah_id);
  if (!surah_id || Number.isNaN(surahIdNum)) {
    return { error: `العنصر ${index + 1}: يرجى اختيار السورة` };
  }

  if (!RATINGS.includes(rating as Rating)) {
    return { error: `العنصر ${index + 1}: يرجى اختيار التقييم` };
  }

  const from = Number(from_ayah);
  const to = Number(to_ayah);

  if (Number.isNaN(from) || Number.isNaN(to) || from < 1 || to < 1) {
    return { error: `العنصر ${index + 1}: يرجى إدخال أرقام الآيات` };
  }
  if (from > to) {
    return { error: `العنصر ${index + 1}: آية البداية يجب أن تكون أقل من أو تساوي آية النهاية` };
  }

  // Optional pages count (>= 0). Empty/absent → null.
  let pagesValue: number | null = null;
  if (pages !== undefined && pages !== null && pages !== "") {
    const pNum = Number(pages);
    if (Number.isNaN(pNum) || pNum < 0) {
      return { error: `العنصر ${index + 1}: عدد الصفحات يجب أن يكون رقماً صحيحاً` };
    }
    pagesValue = Math.floor(pNum);
  }

  // Optional notes (max length).
  let notesValue: string | null = null;
  if (typeof notes === "string") {
    if (notes.length > MAX_NOTES_LENGTH) {
      return { error: `العنصر ${index + 1}: الملاحظات طويلة جداً (الحد ${MAX_NOTES_LENGTH} حرف)` };
    }
    notesValue = notes;
  }

  return {
    data: {
      session_type: session_type as SessionType,
      surah_id: surahIdNum,
      from_ayah: from,
      to_ayah: to,
      rating: rating as Rating,
      pages: pagesValue,
      notes: notesValue,
    },
  };
}

/**
 * Validate a full session payload (parent + items).
 *
 * `surahAyahCounts` maps surah_id → total ayah count, used to validate
 * that to_ayah doesn't exceed the surah's total. If a surah_id is not in
 * the map, the caller should have already rejected it.
 */
export function validateSessionPayload(
  body: Record<string, unknown>,
  surahAyahCounts: Map<number, number>,
  todayDate?: string,
): { data: SessionPayload } | { error: string } {
  const { student_id, session_date, overall_rating, notes, items } = body;

  if (!student_id || typeof student_id !== "string") {
    return { error: "يرجى اختيار الطالب" };
  }

  if (!session_date || typeof session_date !== "string") {
    return { error: "يرجى تحديد تاريخ الجلسة" };
  }
  if (!DATE_FORMAT.test(session_date)) {
    return { error: "صيغة التاريخ غير صحيحة (YYYY-MM-DD)" };
  }
  if (todayDate && session_date > todayDate) {
    return { error: "لا يمكن تسجيل جلسة في تاريخ مستقبلي" };
  }

  if (!RATINGS.includes(overall_rating as Rating)) {
    return { error: "يرجى اختيار التقييم العام للجلسة" };
  }

  // Session-level notes
  let notesValue: string | null = null;
  if (typeof notes === "string") {
    if (notes.length > MAX_NOTES_LENGTH) {
      return { error: `ملاحظات الجلسة طويلة جداً (الحد ${MAX_NOTES_LENGTH} حرف)` };
    }
    notesValue = notes;
  }

  // Items
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "يجب إضافة عنصر واحد على الأقل للجلسة" };
  }

  const validatedItems: SessionItemPayload[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Record<string, unknown>;
    const result = validateSessionItem(item, i);
    if ("error" in result) return result;

    // Validate to_ayah against surah total
    const totalAyahs = surahAyahCounts.get(result.data.surah_id);
    if (totalAyahs !== undefined && result.data.to_ayah > totalAyahs) {
      return { error: `العنصر ${i + 1}: آية النهاية لا يمكن أن تتجاوز ${totalAyahs} (عدد آيات السورة)` };
    }

    validatedItems.push(result.data);
  }

  return {
    data: {
      student_id,
      session_date,
      overall_rating: overall_rating as Rating,
      notes: notesValue,
      items: validatedItems,
    },
  };
}