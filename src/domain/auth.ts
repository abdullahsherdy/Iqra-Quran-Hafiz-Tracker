/**
 * Pure auth/registration domain logic — no I/O, no Drizzle, no Supabase.
 *
 * These validators back the self-registration server actions
 * (`features/auth/register.ts`). Keeping them pure lets the unit tests
 * exercise the email/password/payload rules without a live DB or Supabase.
 * The student branch reuses `validateStudentPayload` so the student-record
 * rules (guardian name/phone, Egyptian phone format, gender, dates) stay a
 * single source of truth.
 */

import { validateStudentPayload } from "./students";

/**
 * Pragmatic email shape check: non-empty local part, an `@`, and a dotted
 * domain. Deliberately loose — Supabase Auth is the real authority on
 * deliverability; this only rejects obviously malformed input before we spend
 * a network round-trip on `signUp`.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password length (matches Supabase's default and the teacher reset rule). */
export const MIN_PASSWORD_LENGTH = 6;

export function validateEmail(email: unknown): string | null {
  if (typeof email !== "string" || !email.trim()) {
    return "البريد الإلكتروني مطلوب";
  }
  if (!EMAIL_RE.test(email.trim())) {
    return "صيغة البريد الإلكتروني غير صحيحة";
  }
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`;
  }
  return null;
}

const GENDERS = ["male", "female"] as const;

/**
 * Validate a student self-registration payload. Returns an Arabic error string
 * or null. Checks the auth credentials (email + password) first, then the full
 * student record via `validateStudentPayload` (guardian name/phone, gender,
 * dates) — self-registered students still create a complete student record.
 */
export function validateStudentRegistration(body: {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  gender?: unknown;
  birth_date?: unknown;
  guardian_name?: unknown;
  guardian_phone?: unknown;
}): string | null {
  const emailError = validateEmail(body.email);
  if (emailError) return emailError;

  const passwordError = validatePassword(body.password);
  if (passwordError) return passwordError;

  return validateStudentPayload(body);
}

/**
 * Validate a teacher self-registration payload. Returns an Arabic error string
 * or null. A teacher account has no student record, so only name, credentials,
 * and gender are required (phone is optional and unvalidated, matching the
 * existing admin teacher-create route).
 */
export function validateTeacherRegistration(body: {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  gender?: unknown;
}): string | null {
  if (typeof body.name !== "string" || !body.name.trim()) {
    return "الاسم مطلوب";
  }

  const emailError = validateEmail(body.email);
  if (emailError) return emailError;

  const passwordError = validatePassword(body.password);
  if (passwordError) return passwordError;

  if (!GENDERS.includes(body.gender as (typeof GENDERS)[number])) {
    return "الجنس يجب أن يكون ذكر أو أنثى";
  }

  return null;
}
