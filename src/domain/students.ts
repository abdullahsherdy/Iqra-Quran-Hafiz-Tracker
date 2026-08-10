/**
 * Pure student domain logic — no I/O, no Drizzle, no Supabase.
 *
 * `getLevelInfo`, `countsFromInitialMemorization`, `validateInitialMemorization`,
 * and `validateStudentPayload` are the pure functions exercised by unit tests.
 * The DB-fetching shell (`recalculateStudentSummary`) lives in
 * `features/students/server/recalc.ts`.
 */

import type { Gender, StudentStatus } from "./types";

/** Level thresholds per §6.1.1 */
export type Level = "beginner" | "intermediate" | "advanced" | "completed";

export interface LevelInfo {
  level: Level;
  label: string;
}

export function getLevelInfo(memorizedJuzCount: number): LevelInfo {
  if (memorizedJuzCount >= 30) return { level: "completed", label: "خاتم" };
  if (memorizedJuzCount >= 15) return { level: "advanced", label: "متقدم" };
  if (memorizedJuzCount >= 5) return { level: "intermediate", label: "متوسط" };
  return { level: "beginner", label: "مبتدئ" };
}

export function countsFromInitialMemorization(
  rows: Array<{ status: string }>
): { memorized_juz_count: number; ijaza_juz_count: number } {
  return {
    memorized_juz_count: rows.length,
    ijaza_juz_count: rows.filter((r) => r.status === "with_ijaza").length,
  };
}

const INITIAL_MEM_STATUSES = ["memorized", "with_ijaza"] as const;
const STUDENT_STATUSES = ["active", "paused", "graduated", "withdrawn"] as const;
const GENDERS = ["male", "female"] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Egyptian mobile phone: 11 digits starting with 010/011/012/015. */
const EGYPT_PHONE_RE = /^01[0125]\d{8}$/;

export function validateInitialMemorization(
  rows: Array<{ juz_number: number; status: string; sheikh_name?: string | null; pages?: number | null }>
): string | null {
  for (const row of rows) {
    if (
      typeof row.juz_number !== "number" ||
      row.juz_number < 1 ||
      row.juz_number > 30
    ) {
      return `رقم الجزء يجب أن يكون بين 1 و 30`;
    }
    if (!INITIAL_MEM_STATUSES.includes(row.status as (typeof INITIAL_MEM_STATUSES)[number])) {
      return `حالة الحفظ غير صحيحة للجزء ${row.juz_number}`;
    }
    if (row.status === "with_ijaza" && !row.sheikh_name?.trim()) {
      return `يرجى إدخال اسم الشيخ للجزء ${row.juz_number}`;
    }
    if (
      row.pages !== undefined &&
      row.pages !== null &&
      (!Number.isFinite(row.pages) || !Number.isInteger(row.pages) || row.pages < 1 || row.pages > 23)
    ) {
      return `عدد الصفحات للجزء ${row.juz_number} يجب أن يكون بين 1 و 23`;
    }
  }
  return null;
}

/**
 * Validate a student create/update payload (I2). Returns an Arabic error
 * string or null if valid. Checks: gender enum, date formats (YYYY-MM-DD),
 * and optional status enum (only checked when present).
 */
export function validateStudentPayload(body: {
  name?: unknown;
  gender?: unknown;
  birth_date?: unknown;
  guardian_name?: unknown;
  guardian_phone?: unknown;
  enrollment_date?: unknown;
  notes?: unknown;
  status?: unknown;
}): string | null {
  const { name, gender, birth_date, guardian_name, guardian_phone, enrollment_date, status } = body;

  if (typeof name !== "string" || !name.trim()) {
    return "الاسم مطلوب";
  }
  if (typeof guardian_name !== "string" || !guardian_name.trim()) {
    return "اسم ولي الأمر مطلوب";
  }
  if (typeof guardian_phone !== "string" || !guardian_phone.trim()) {
    return "رقم هاتف ولي الأمر مطلوب";
  }
  if (!EGYPT_PHONE_RE.test(guardian_phone.trim())) {
    return "رقم الهاتف يجب أن يكون 11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015";
  }
  if (!GENDERS.includes(gender as (typeof GENDERS)[number])) {
    return "الجنس يجب أن يكون ذكر أو أنثى";
  }
  if (
    birth_date !== undefined &&
    birth_date !== null &&
    (typeof birth_date !== "string" || !ISO_DATE_RE.test(birth_date))
  ) {
    return "صيغة تاريخ الميلاد غير صحيحة (YYYY-MM-DD)";
  }
  if (
    enrollment_date !== undefined &&
    enrollment_date !== null &&
    (typeof enrollment_date !== "string" || !ISO_DATE_RE.test(enrollment_date))
  ) {
    return "صيغة تاريخ التسجيل غير صحيحة (YYYY-MM-DD)";
  }
  if (
    status !== undefined &&
    status !== null &&
    !STUDENT_STATUSES.includes(status as (typeof STUDENT_STATUSES)[number])
  ) {
    return "حالة الطالب غير صحيحة";
  }
  return null;
}

export const levelBgMap: Record<Level, string> = {
  completed: "bg-[#dcfce7] text-[#166534]",
  advanced: "bg-[#dbeafe] text-[#1e40af]",
  intermediate: "bg-[#fef9c3] text-[#854d0e]",
  beginner: "bg-[#f3f4f6] text-[#374151]",
};

// Re-export for convenience
export type { Gender, StudentStatus };
