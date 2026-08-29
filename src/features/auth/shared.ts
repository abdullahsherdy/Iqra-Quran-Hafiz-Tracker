import type { AppRole } from "@/domain/types";
export type { AppRole };

/**
 * Unified application user type — the single source of truth for the
 * `public.users` row shape used across the app (I5 consolidation).
 * Field names match the DB columns (snake_case) so it aligns with both
 * raw Supabase query results and the Drizzle schema.
 */
export interface AppUser {
  id: string;
  name: string;
  username: string;
  role: AppRole;
  gender: string | null;
  can_view_all_genders: boolean;
  is_active: boolean;
}

export interface AuthMeResponse {
  id: string;
  name: string;
  role: AppRole;
}

export interface LoginActionState {
  errorMessage: string | null;
}

export const initialLoginActionState: LoginActionState = {
  errorMessage: null,
};

/**
 * State for the self-registration form (`registerStudentAction` /
 * `registerTeacherAction`). `idle` before submit, `error` with an Arabic
 * message on failure, and `success` with a "check your email" message once the
 * account is created (the user is NOT logged in — email confirmation required).
 */
export interface RegisterActionState {
  status: "idle" | "error" | "success";
  message: string | null;
}

export const initialRegisterActionState: RegisterActionState = {
  status: "idle",
  message: null,
};

const DEFAULT_AUTH_EMAIL_DOMAIN = "noor-al-eman.local";

export function getAuthEmailDomain(): string {
  return process.env.AUTH_EMAIL_DOMAIN?.trim() || DEFAULT_AUTH_EMAIL_DOMAIN;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${getAuthEmailDomain()}`;
}

/**
 * Resolve a login identifier to the email Supabase Auth expects.
 * - Contains "@" → a real email (new email-registered students/teachers) →
 *   used as-is (trimmed + lowercased).
 * - Otherwise → a legacy username (existing admin/teacher) → mapped to the
 *   synthetic email via `usernameToEmail`.
 */
export function resolveLoginEmail(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : usernameToEmail(trimmed);
}

export function isAdmin(role: AppRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: AppRole): boolean {
  return role === "super_admin";
}

export function isStudent(role: AppRole): boolean {
  return role === "student";
}

export function roleHomePath(role: AppRole): string {
  if (isStudent(role)) return "/student";
  return isAdmin(role) ? "/admin/reports" : "/teacher/reports";
}
