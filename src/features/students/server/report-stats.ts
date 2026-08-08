import "server-only";

import { and, eq, gte } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  studentsTable,
  sessionsTable,
  sessionItemsTable,
  usersTable,
} from "@/db/schema";
import {
  computeStudentPageStats,
  computeHonorRoll,
  computeDashboardSummary,
  type StudentPageStats,
  type HonorRollEntry,
  type DashboardSummary,
  type StudentRow,
  type StudentSessionItemRow,
} from "@/domain/report-stats";
import { todayDateString, toDateString } from "@/lib/utils";

export interface ReportStatsResult {
  summary: DashboardSummary;
  honorToday: HonorRollEntry[];
  honorMonth: HonorRollEntry[];
  students: StudentPageStats[];
}

/**
 * Fetch all data needed for the reports dashboard and compute statistics.
 *
 * Admin sees all students. Teacher sees gender-scoped students only.
 * Pass `teacherGender` and `canViewAllGenders` for teacher scoping.
 */
export async function fetchReportStats(
  db: Db,
  opts: {
    teacherId?: string;
    teacherGender?: string | null;
    canViewAllGenders?: boolean;
  } = {},
): Promise<ReportStatsResult> {
  const now = new Date();
  const today = todayDateString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = toDateString(monthStart);

  // Build student query conditions
  const studentConditions = [];
  if (opts.teacherGender && !opts.canViewAllGenders) {
    studentConditions.push(eq(studentsTable.gender, opts.teacherGender));
  }

  // Fetch students, session items, session dates, and teacher count in parallel
  const [studentRows, itemRows, sessionsTodayRows, sessionsMonthRows, teacherCountRows] =
    await Promise.all([
      db
        .select({
          id: studentsTable.id,
          name: studentsTable.name,
          gender: studentsTable.gender,
          status: studentsTable.status,
          memorized_juz_count: studentsTable.memorized_juz_count,
          ijaza_juz_count: studentsTable.ijaza_juz_count,
          last_session_date: studentsTable.last_session_date,
          enrollment_date: studentsTable.enrollment_date,
        })
        .from(studentsTable)
        .where(studentConditions.length > 0 ? and(...studentConditions) : undefined),
      db
        .select({
          student_id: sessionsTable.student_id,
          session_date: sessionsTable.session_date,
          session_type: sessionItemsTable.session_type,
          pages: sessionItemsTable.pages,
        })
        .from(sessionItemsTable)
        .innerJoin(sessionsTable, eq(sessionItemsTable.session_id, sessionsTable.id))
        .innerJoin(studentsTable, eq(sessionsTable.student_id, studentsTable.id))
        .where(
          studentConditions.length > 0 ? and(...studentConditions) : undefined,
        ),
      db
        .select({ session_date: sessionsTable.session_date })
        .from(sessionsTable)
        .where(eq(sessionsTable.session_date, today)),
      db
        .select({ session_date: sessionsTable.session_date })
        .from(sessionsTable)
        .where(gte(sessionsTable.session_date, monthStartStr)),
      db
        .select({ count: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.role, "teacher"), eq(usersTable.is_active, true))),
    ]);

  const students: StudentRow[] = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    gender: s.gender,
    status: s.status,
    memorized_juz_count: s.memorized_juz_count,
    ijaza_juz_count: s.ijaza_juz_count,
    last_session_date: s.last_session_date,
    enrollment_date: s.enrollment_date,
  }));

  const items: StudentSessionItemRow[] = itemRows.map((i) => ({
    student_id: i.student_id,
    session_date: i.session_date,
    session_type: i.session_type,
    pages: i.pages,
  }));

  const stats = computeStudentPageStats(students, items);
  const honorToday = computeHonorRoll(stats, "today", 5);
  const honorMonth = computeHonorRoll(stats, "month", 5);
  const summary = computeDashboardSummary(
    students,
    items,
    sessionsTodayRows.map((s) => s.session_date),
    sessionsMonthRows.map((s) => s.session_date),
    teacherCountRows.length,
  );

  return { summary, honorToday, honorMonth, students: stats };
}
