import "server-only";

import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { studentsTable } from "@/db/schema";
import type { AppUser } from "./shared";
import { isAdmin } from "./shared";
import { getAppUserByAuthId } from "./session";

/** Re-export — same function as `getAppUserByAuthId` in `session.ts` (A2). */
export const getApiAppUser = getAppUserByAuthId;

/**
 * Check whether a teacher can access a student. With the assignment system
 * removed, access is determined solely by gender scoping:
 *   - admin → always true
 *   - teacher with can_view_all_genders → true
 *   - teacher → true only if student.gender === teacher.gender
 *
 * Returns false if the student does not exist.
 */
export async function canAccessStudent(
  db: Db,
  appUser: AppUser,
  studentId: string
): Promise<boolean> {
  const [student] = await db
    .select({ id: studentsTable.id, gender: studentsTable.gender })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  if (!student) return false;
  if (isAdmin(appUser.role)) return true;

  if (!appUser.can_view_all_genders && student.gender !== appUser.gender) {
    return false;
  }

  return true;
}
