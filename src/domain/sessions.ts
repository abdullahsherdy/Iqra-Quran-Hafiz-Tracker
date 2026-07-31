/**
 * Pure session validation — no I/O, no Drizzle, no Supabase.
 */

import type { Rating, SessionType } from "./types";

export interface SessionPayload {
  student_id: string;
  session_date: string;
  session_type: SessionType;
  surah_id: number;
  from_ayah: number;
  to_ayah: number;
  rating: Rating;
  pages?: number | null;
  notes?: string | null;
}

const SESSION_TYPES: SessionType[] = ["new_memorization", "review"];
const RATINGS: Rating[] = ["excellent", "good", "weak"];

export function validateSessionPayload(
  body: Record<string, unknown>,
  totalAyahs: number
): { data: SessionPayload } | { error: string } {
  const {
    student_id,
    session_date,
    session_type,
    surah_id,
    from_ayah,
    to_ayah,
    rating,
    pages,
    notes,
  } = body;

  if (!student_id || typeof student_id !== "string") {
    return { error: "يرجى اختيار الطالب" };
  }
  if (!session_date || typeof session_date !== "string") {
    return { error: "يرجى تحديد تاريخ الجلسة" };
  }
  if (!SESSION_TYPES.includes(session_type as SessionType)) {
    return { error: "يرجى اختيار نوع الجلسة" };
  }
  const surahIdNum = Number(surah_id);
  if (!surah_id || Number.isNaN(surahIdNum)) {
    return { error: "يرجى اختيار السورة" };
  }
  if (!RATINGS.includes(rating as Rating)) {
    return { error: "يرجى اختيار التقييم" };
  }

  const from = Number(from_ayah);
  const to = Number(to_ayah);

  if (!from || !to || from < 1 || to < 1) {
    return { error: "يرجى إدخال أرقام الآيات" };
  }
  if (from > to) {
    return { error: "آية البداية يجب أن تكون أقل من أو تساوي آية النهاية" };
  }
  if (to > totalAyahs) {
    return { error: `آية النهاية لا يمكن أن تتجاوز ${totalAyahs} (عدد آيات السورة)` };
  }

  // Optional pages count (>= 0). Empty/absent → null.
  let pagesValue: number | null = null;
  if (pages !== undefined && pages !== null && pages !== "") {
    const pNum = Number(pages);
    if (Number.isNaN(pNum) || pNum < 0) {
      return { error: "عدد الصفحات يجب أن يكون رقماً صحيحاً" };
    }
    pagesValue = Math.floor(pNum);
  }

  return {
    data: {
      student_id,
      session_date,
      session_type: session_type as SessionType,
      surah_id: surahIdNum,
      from_ayah: from,
      to_ayah: to,
      rating: rating as Rating,
      pages: pagesValue,
      notes: typeof notes === "string" ? notes : null,
    },
  };
}
