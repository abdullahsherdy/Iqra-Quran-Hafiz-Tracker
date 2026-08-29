"use server";

import { headers } from "next/headers";

import {
  type RegisterActionState,
} from "./shared";
import { createSupabaseServerActionClient } from "@/infrastructure/auth/server";
import { createSupabaseAdminClient } from "@/infrastructure/auth/admin";
import { getDb } from "@/db/client";
import { usersTable, studentsTable } from "@/db/schema";
import { logAction } from "@/features/audit/audit-log";
import { sanitizeError } from "@/lib/api-error";
import { todayDateString } from "@/lib/utils";
import {
  validateStudentRegistration,
  validateTeacherRegistration,
} from "@/domain/auth";

/**
 * Self-registration server actions for the public `/register` page.
 *
 * Both flows use `supabase.auth.signUp` (native email-verification) rather than
 * the admin `createUser` path used by the staff-only teacher-create route — a
 * new signup must confirm their email before they can log in.
 *
 * Identity convention: the full email is stored as `users.username` (the column
 * is UNIQUE and was widened to varchar(255) in migration 0006), so no separate
 * username is collected. Login resolves email-vs-username via `resolveLoginEmail`.
 *
 * - Student → `users` (role student, active) + linked `students` record.
 * - Teacher → `users` (role teacher, INACTIVE — pending admin approval), no
 *   student record.
 */

/** audit_logs.username is varchar(50); an email can exceed that. */
const AUDIT_USERNAME_MAX = 50;

/**
 * Resolve the site origin for the email confirmation link. Prefers an explicit
 * `NEXT_PUBLIC_SITE_URL` (set this in production); otherwise derives it from the
 * request headers so local dev works with no extra config.
 */
async function getSiteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;

  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/**
 * Map a Supabase signUp error to a SAFE Arabic message. Never returns the raw
 * error text (it can leak provider internals). Falls back to a generic message.
 */
function mapSignUpError(error: { message?: string } | null): string {
  const msg = error?.message?.toLowerCase() ?? "";
  if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
    return "هذا البريد الإلكتروني مسجّل بالفعل. جرّب تسجيل الدخول بدلاً من ذلك.";
  }
  if (msg.includes("password")) {
    return "كلمة المرور ضعيفة جداً. اختر كلمة مرور أقوى.";
  }
  if (msg.includes("email")) {
    return "صيغة البريد الإلكتروني غير صحيحة.";
  }
  return "تعذّر إنشاء الحساب. يرجى المحاولة مرة أخرى.";
}

/** Best-effort rollback of the auth user when the DB insert fails afterwards. */
async function rollbackAuthUser(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  try {
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // Best effort — leaves an orphan auth user at worst (no DB row, cannot log in).
  }
}

interface SignUpResult {
  userId?: string;
  error?: string;
}

/**
 * Shared signUp step. Sends the confirmation email and returns the new auth
 * user id, or an Arabic error. Detects Supabase's anti-enumeration response
 * (an existing email yields a user object with an EMPTY `identities` array and
 * no error) and treats it as "already registered" so we never insert an orphan
 * DB row for an account we did not actually create.
 */
async function signUpAuthUser(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerActionClient>>>,
  email: string,
  password: string,
  name: string,
  role: "student" | "teacher"
): Promise<SignUpResult> {
  const origin = await getSiteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=/login`,
      data: { name, role },
    },
  });

  if (error || !data.user) {
    return { error: mapSignUpError(error) };
  }

  // Empty identities → the email already exists (obfuscated response).
  if ((data.user.identities?.length ?? 0) === 0) {
    return { error: "هذا البريد الإلكتروني مسجّل بالفعل. جرّب تسجيل الدخول بدلاً من ذلك." };
  }

  return { userId: data.user.id };
}

export async function registerStudentAction(
  _previousState: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const gender = String(formData.get("gender") ?? "");
  const guardian_name = String(formData.get("guardian_name") ?? "").trim();
  const guardian_phone = String(formData.get("guardian_phone") ?? "").trim();
  const birthDateRaw = String(formData.get("birth_date") ?? "").trim();
  const birth_date = birthDateRaw || null;

  const validationError = validateStudentRegistration({
    email,
    password,
    name,
    gender,
    guardian_name,
    guardian_phone,
    birth_date,
  });
  if (validationError) {
    return { status: "error", message: validationError };
  }

  const supabase = await createSupabaseServerActionClient();
  if (!supabase) {
    return {
      status: "error",
      message: "إعدادات Supabase غير مكتملة. أضف القيم إلى ملف .env.local أولاً.",
    };
  }

  const { userId, error: signUpError } = await signUpAuthUser(
    supabase,
    email,
    password,
    name,
    "student"
  );
  if (signUpError || !userId) {
    return { status: "error", message: signUpError ?? "تعذّر إنشاء الحساب." };
  }

  const db = getDb();
  if (!db) {
    await rollbackAuthUser(userId);
    return {
      status: "error",
      message: "إعدادات قاعدة البيانات غير مكتملة. أضف DATABASE_URL إلى ملف .env.local.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
        id: userId,
        name,
        username: email,
        role: "student",
        gender,
        is_active: true,
      });
      await tx.insert(studentsTable).values({
        user_id: userId,
        name,
        gender,
        birth_date,
        guardian_name,
        guardian_phone,
        enrollment_date: todayDateString(),
      });
    });
  } catch (error) {
    await rollbackAuthUser(userId);
    await logAction(db, {
      userId,
      username: email.slice(0, AUDIT_USERNAME_MAX),
      action: "register",
      entityType: "student",
      entityId: userId,
      method: "POST",
      path: "/register",
      statusCode: 500,
      requestBody: { name, email, role: "student" },
      responseBody: { error: sanitizeError(error, "student register") },
    });
    return {
      status: "error",
      message: sanitizeError(error, "student register"),
    };
  }

  await logAction(db, {
    userId,
    username: email.slice(0, AUDIT_USERNAME_MAX),
    action: "register",
    entityType: "student",
    entityId: userId,
    method: "POST",
    path: "/register",
    statusCode: 201,
    requestBody: { name, email, role: "student" },
    responseBody: { ok: true },
  });

  return {
    status: "success",
    message:
      "تم إنشاء حسابك بنجاح. أرسلنا رابط تفعيل إلى بريدك الإلكتروني — افتحه لتأكيد الحساب ثم سجّل الدخول.",
  };
}

export async function registerTeacherAction(
  _previousState: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const gender = String(formData.get("gender") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw || null;

  const validationError = validateTeacherRegistration({ email, password, name, gender });
  if (validationError) {
    return { status: "error", message: validationError };
  }

  const supabase = await createSupabaseServerActionClient();
  if (!supabase) {
    return {
      status: "error",
      message: "إعدادات Supabase غير مكتملة. أضف القيم إلى ملف .env.local أولاً.",
    };
  }

  const { userId, error: signUpError } = await signUpAuthUser(
    supabase,
    email,
    password,
    name,
    "teacher"
  );
  if (signUpError || !userId) {
    return { status: "error", message: signUpError ?? "تعذّر إنشاء الحساب." };
  }

  const db = getDb();
  if (!db) {
    await rollbackAuthUser(userId);
    return {
      status: "error",
      message: "إعدادات قاعدة البيانات غير مكتملة. أضف DATABASE_URL إلى ملف .env.local.",
    };
  }

  try {
    // is_active: false → the account is created but blocked from logging in
    // until an admin approves it on the teachers page.
    await db.insert(usersTable).values({
      id: userId,
      name,
      username: email,
      role: "teacher",
      phone,
      gender,
      is_active: false,
    });
  } catch (error) {
    await rollbackAuthUser(userId);
    await logAction(db, {
      userId,
      username: email.slice(0, AUDIT_USERNAME_MAX),
      action: "register",
      entityType: "teacher",
      entityId: userId,
      method: "POST",
      path: "/register",
      statusCode: 500,
      requestBody: { name, email, role: "teacher" },
      responseBody: { error: sanitizeError(error, "teacher register") },
    });
    return {
      status: "error",
      message: sanitizeError(error, "teacher register"),
    };
  }

  await logAction(db, {
    userId,
    username: email.slice(0, AUDIT_USERNAME_MAX),
    action: "register",
    entityType: "teacher",
    entityId: userId,
    method: "POST",
    path: "/register",
    statusCode: 201,
    requestBody: { name, email, role: "teacher" },
    responseBody: { ok: true, pending_approval: true },
  });

  return {
    status: "success",
    message:
      "تم إنشاء حسابك بنجاح. أرسلنا رابط تفعيل إلى بريدك الإلكتروني — افتحه لتأكيد الحساب. بعد ذلك سيراجع المشرف حسابك ويفعّله قبل أن تتمكن من الدخول.",
  };
}
