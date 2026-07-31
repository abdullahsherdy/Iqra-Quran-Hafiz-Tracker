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

export function roleHomePath(role: AppRole): string {
  return role === "admin" ? "/admin" : "/teacher";
}
