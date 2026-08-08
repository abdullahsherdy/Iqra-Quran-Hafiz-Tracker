import "server-only";

import { and, eq, gte, lte, desc } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  studentsTable,
  sessionsTable,
  sessionItemsTable,
  surahsTable,
  usersTable,
  attendanceTable,
  ijazatTable,
  initialMemorizationTable,
} from "@/db/schema";
import {
  getPeriodRange,
  type ReportPeriod,
} from "@/domain/report-stats";
import { getLevelInfo } from "@/domain/students";

export interface ParentReportSessionEntry {
  session_date: string;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  session_type: string;
  rating: string;
  pages: number | null;
  teacher_name: string;
}

export interface ParentReportData {
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  gender: string;
  enrollmentDate: string;
  levelLabel: string;
  memorizedJuzCount: number;
  ijazaJuzCount: number;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  sessions: ParentReportSessionEntry[];
  totalSessions: number;
  totalPages: number;
  attendanceDays: number;
  ijazat: { ijaza_type: string; juz_number: number | null; sheikh_name: string; ijaza_date: string }[];
  initialMemorization: { juz_number: number; status: string; sheikh_name: string | null; pages: number | null }[];
  generatedBy: string;
  generatedAt: string;
}

/**
 * Fetch all data needed for a single student's parent report.
 */
export async function fetchParentReportData(
  db: Db,
  studentId: string,
  period: ReportPeriod,
  generatedByName: string,
): Promise<ParentReportData | null> {
  // Fetch student
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  if (!student) return null;

  const range = getPeriodRange(period, student.enrollment_date);

  // Fetch session items with surah names and teacher names, filtered by period
  const [sessionItemRows, attendanceRows, ijazatRows, initMemRows] = await Promise.all([
    db
      .select({
        session_date: sessionsTable.session_date,
        surah_id: sessionItemsTable.surah_id,
        surah_name: surahsTable.name_arabic,
        from_ayah: sessionItemsTable.from_ayah,
        to_ayah: sessionItemsTable.to_ayah,
        session_type: sessionItemsTable.session_type,
        rating: sessionItemsTable.rating,
        pages: sessionItemsTable.pages,
        teacher_name: usersTable.name,
      })
      .from(sessionItemsTable)
      .innerJoin(sessionsTable, eq(sessionItemsTable.session_id, sessionsTable.id))
      .leftJoin(surahsTable, eq(sessionItemsTable.surah_id, surahsTable.id))
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .where(
        and(
          eq(sessionsTable.student_id, studentId),
          gte(sessionsTable.session_date, range.from),
          lte(sessionsTable.session_date, range.to),
        ),
      )
      .orderBy(desc(sessionsTable.session_date)),
    db
      .select({ attendance_date: attendanceTable.attendance_date })
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.student_id, studentId),
          gte(attendanceTable.attendance_date, range.from),
          lte(attendanceTable.attendance_date, range.to),
        ),
      ),
    db
      .select({
        ijaza_type: ijazatTable.ijaza_type,
        juz_number: ijazatTable.juz_number,
        sheikh_name: ijazatTable.sheikh_name,
        ijaza_date: ijazatTable.ijaza_date,
      })
      .from(ijazatTable)
      .where(eq(ijazatTable.student_id, studentId))
      .orderBy(desc(ijazatTable.ijaza_date)),
    db
      .select({
        juz_number: initialMemorizationTable.juz_number,
        status: initialMemorizationTable.status,
        sheikh_name: initialMemorizationTable.sheikh_name,
        pages: initialMemorizationTable.pages,
      })
      .from(initialMemorizationTable)
      .where(eq(initialMemorizationTable.student_id, studentId))
      .orderBy(initialMemorizationTable.juz_number),
  ]);

  const sessions: ParentReportSessionEntry[] = sessionItemRows.map((r) => ({
    session_date: r.session_date,
    surah_name: r.surah_name ?? "",
    from_ayah: r.from_ayah,
    to_ayah: r.to_ayah,
    session_type: r.session_type,
    rating: r.rating,
    pages: r.pages,
    teacher_name: r.teacher_name ?? "",
  }));

  const totalPages = sessions.reduce((sum, s) => sum + (s.pages ?? 0), 0);
  const { label: levelLabel } = getLevelInfo(student.memorized_juz_count);

  return {
    studentName: student.name,
    guardianName: student.guardian_name,
    guardianPhone: student.guardian_phone,
    gender: student.gender,
    enrollmentDate: student.enrollment_date,
    levelLabel,
    memorizedJuzCount: student.memorized_juz_count,
    ijazaJuzCount: student.ijaza_juz_count,
    periodLabel: range.label,
    periodFrom: range.from,
    periodTo: range.to,
    sessions,
    totalSessions: new Set(sessions.map((s) => s.session_date)).size,
    totalPages,
    attendanceDays: attendanceRows.length,
    ijazat: ijazatRows,
    initialMemorization: initMemRows.map((r) => ({
      juz_number: r.juz_number,
      status: r.status,
      sheikh_name: r.sheikh_name,
      pages: r.pages,
    })),
    generatedBy: generatedByName,
    generatedAt: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  };
}
