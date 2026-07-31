import "server-only";

import { createSupabaseServerComponentClient } from "@/infrastructure/auth/server";
import { getDb, type Db } from "@/db/client";
import { getApiAppUser, canAccessStudent } from "./student-access";
import type { AppUser } from "./shared";

/**
 * Shared API context — eliminates the ~10 lines of auth/db-client
 * boilerplate repeated at the top of every API route handler (DRY-1).
 *
 * Auth still uses the Supabase JS SDK (for `auth.getUser()` — Supabase Auth
 * is not exposed via Postgres). All DATA queries should use the Drizzle `db`
 * client (typed, bypasses RLS — app enforces scoping in code).
 *
 * Returns either:
 *   - `{ ok: true, db, appUser }` — ready to do work
 *   - `{ ok: false, response }` — an error Response to return immediately
 *
 * Usage:
 *   const ctx = await getApiContext();
 *   if (!ctx.ok) return ctx.response;
 *   const { db, appUser } = ctx;
 */
export type ApiContext =
  | { ok: true; db: Db; appUser: AppUser }
  | { ok: false; response: Response };

export async function getApiContext(): Promise<ApiContext> {
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) {
    return { ok: false, response: Response.json({ error: "Config missing" }, { status: 500 }) };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const db = getDb();
  if (!db) {
    return { ok: false, response: Response.json({ error: "Config missing" }, { status: 500 }) };
  }

  const appUser = await getApiAppUser(db, user.id);
  if (!appUser || !appUser.is_active) {
    return { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, db, appUser };
}

/**
 * Convenience: get the context AND verify the caller can access a specific
 * student. Returns the context + a boolean for access.
 */
export async function getApiContextForStudent(
  studentId: string,
): Promise<
  | { ok: true; db: Db; appUser: AppUser; canAccess: boolean }
  | { ok: false; response: Response }
> {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx;

  const canAccess = await canAccessStudent(ctx.db, ctx.appUser, studentId);
  return { ok: true, db: ctx.db, appUser: ctx.appUser, canAccess };
}
