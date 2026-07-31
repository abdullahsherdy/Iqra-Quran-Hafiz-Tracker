import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  studentsTable,
  teacherStudentAssignmentsTable,
} from "@/db/schema";
import type { AppUser } from "./shared";
import { getAppUserByAuthId } from "./session";

/** Re-export — same function as `getAppUserByAuthId` in `session.ts` (A2). */
export const getApiAppUser = getAppUserByAuthId;

export async function getAssignedStudentIds(
  db: Db,
  teacherId: string
): Promise<string[]> {
  const rows = await db
    .select({ student_id: teacherStudentAssignmentsTable.student_id })
    .from(teacherStudentAssignmentsTable)
    .where(
      and(
        eq(teacherStudentAssignmentsTable.teacher_id, teacherId),
        isNull(teacherStudentAssignmentsTable.end_date),
      ),
    );
  return rows.map((r) => r.student_id);
}

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
  if (appUser.role === "admin") return true;

  if (!appUser.can_view_all_genders && student.gender !== appUser.gender) {
    return false;
  }

  const [assign] = await db
    .select({ id: teacherStudentAssignmentsTable.id })
    .from(teacherStudentAssignmentsTable)
    .where(
      and(
        eq(teacherStudentAssignmentsTable.teacher_id, appUser.id),
        eq(teacherStudentAssignmentsTable.student_id, studentId),
        isNull(teacherStudentAssignmentsTable.end_date),
      ),
    )
    .limit(1);

  return !!assign;
}
