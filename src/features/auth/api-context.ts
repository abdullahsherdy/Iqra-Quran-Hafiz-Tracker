import "server-only";

import { eq } from "drizzle-orm";

import { createSupabaseServerComponentClient } from "@/infrastructure/auth/server";
import { getDb, type Db } from "@/db/client";
import { studentsTable } from "@/db/schema";
import { getApiAppUser } from "./student-access";
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

/**
 * Resolve the authenticated caller into `{ db, appUser }` (no role gate).
 * Shared by `getApiContext` (staff) and `getStudentContext` (student portal).
 */
async function resolveAuthedAppUser(): Promise<ApiContext> {
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
 * Staff-only API context (admin / teacher). A `student`-role caller is
 * rejected with 403 here so that EVERY existing data route (which uses this
 * helper) is closed to students in one place — students would otherwise fall
 * through role scoping and read all data. Student-portal endpoints use
 * `getStudentContext()` instead.
 */
export async function getApiContext(): Promise<ApiContext> {
  const ctx = await resolveAuthedAppUser();
  if (!ctx.ok) return ctx;

  if (ctx.appUser.role === "student") {
    return { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return ctx;
}

export type StudentContext =
  | { ok: true; db: Db; appUser: AppUser; studentId: string }
  | { ok: false; response: Response };

/**
 * Student-portal API context. Requires the caller to be a `student` and
 * resolves their OWN student record id via `students.user_id`. Endpoints that
 * serve the read-only student portal use this so a student can only ever reach
 * their own data.
 *
 *   - 403 if the caller is not a student
 *   - 404 if no student record is linked to the account
 */
export async function getStudentContext(): Promise<StudentContext> {
  const ctx = await resolveAuthedAppUser();
  if (!ctx.ok) return ctx;

  const { db, appUser } = ctx;
  if (appUser.role !== "student") {
    return { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const [student] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(eq(studentsTable.user_id, appUser.id))
    .limit(1);

  if (!student) {
    return { ok: false, response: Response.json({ error: "No linked student record" }, { status: 404 }) };
  }

  return { ok: true, db, appUser, studentId: student.id };
}
