import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the Iqra (اقرأ) database.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the DB schema. Migrations are
 * generated from it via `npm run db:generate` (drizzle-kit generate). The live
 * Supabase Postgres DB is kept in sync either by applying generated migration
 * SQL in the Supabase SQL editor (the project's existing workflow) or via
 * `npm run db:push` (drizzle-kit push, which diffs schema vs. live DB).
 *
 * RLS policies are NOT managed here — they live in `supabase/legacy/rls.sql`
 * and are applied manually once (Drizzle does not manage RLS).
 *
 * JS property names are SNAKE_CASE to match the DB column names and the
 * existing codebase convention (Supabase SDK returns snake_case). This avoids
 * an impedance mismatch that would require aliasing every query or updating
 * 80+ references across the frontend.
 */

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    username: varchar("username", { length: 50 }).unique().notNull(),
    role: text("role").notNull(),
    phone: varchar("phone", { length: 20 }),
    gender: text("gender"),
    can_view_all_genders: boolean("can_view_all_genders").default(false),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [check("users_role_check", sql`${t.role} IN ('admin', 'teacher')`), check("users_gender_check", sql`${t.gender} IS NULL OR ${t.gender} IN ('male', 'female')`)],
);

export const studentsTable = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    gender: text("gender").notNull(),
    birth_date: date("birth_date"),
    guardian_name: varchar("guardian_name", { length: 100 }).notNull(),
    guardian_phone: varchar("guardian_phone", { length: 20 }).notNull(),
    enrollment_date: date("enrollment_date")
      .notNull()
      .default(sql`CURRENT_DATE`),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    // Date the current `status` became effective. Set when status changes
    // (active→paused, →withdrawn, →graduated, or back to active). Used by the
    // attendance engine to skip paused periods and stop at withdrawal/graduation.
    status_since: date("status_since"),
    memorized_juz_count: smallint("memorized_juz_count").notNull().default(0),
    ijaza_juz_count: smallint("ijaza_juz_count").notNull().default(0),
    last_session_date: date("last_session_date"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("students_gender_check", sql`${t.gender} IN ('male', 'female')`),
    check(
      "students_status_check",
      sql`${t.status} IN ('active', 'paused', 'graduated', 'withdrawn')`,
    ),
    index("idx_students_gender").on(t.gender),
    index("idx_students_status").on(t.status),
    index("idx_students_juzcount").on(t.memorized_juz_count),
    index("idx_students_ijazacount").on(t.ijaza_juz_count),
    index("idx_students_lastsession").on(t.last_session_date),
    index("idx_students_birthdate").on(t.birth_date),
    index("idx_students_enrollment").on(t.enrollment_date),
  ],
);

export const teacherStudentAssignmentsTable = pgTable(
  "teacher_student_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacher_id: uuid("teacher_id")
      .notNull()
      .references(() => usersTable.id),
    student_id: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id),
    start_date: date("start_date")
      .notNull()
      .default(sql`CURRENT_DATE`),
    end_date: date("end_date"),
    created_by: uuid("created_by").references(() => usersTable.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_active_assignment")
      .on(t.teacher_id, t.student_id)
      .where(sql`end_date IS NULL`),
    index("idx_active_assignments")
      .on(t.student_id)
      .where(sql`end_date IS NULL`),
  ],
);

export const surahsTable = pgTable("surahs", {
  id: integer("id").primaryKey(),
  name_arabic: varchar("name_arabic", { length: 50 }).notNull(),
  juz_number: integer("juz_number").notNull(),
  total_ayahs: integer("total_ayahs").notNull(),
});

export const juzBoundariesTable = pgTable(
  "juz_boundaries",
  {
    juz_number: integer("juz_number").notNull(),
    surah_id: integer("surah_id")
      .notNull()
      .references(() => surahsTable.id),
    from_ayah: integer("from_ayah").notNull(),
    to_ayah: integer("to_ayah").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.juz_number, t.surah_id] }),
    check("juz_boundaries_juz_number_check", sql`${t.juz_number} BETWEEN 1 AND 30`),
    check("valid_juz_range", sql`${t.from_ayah} <= ${t.to_ayah}`),
  ],
);

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    student_id: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id),
    teacher_id: uuid("teacher_id")
      .notNull()
      .references(() => usersTable.id),
    session_date: date("session_date").notNull(),
    session_type: text("session_type").notNull(),
    surah_id: integer("surah_id")
      .notNull()
      .references(() => surahsTable.id),
    from_ayah: integer("from_ayah").notNull(),
    to_ayah: integer("to_ayah").notNull(),
    rating: text("rating").notNull(),
    pages: integer("pages"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check(
      "sessions_session_type_check",
      sql`${t.session_type} IN ('new_memorization', 'review')`,
    ),
    check("sessions_rating_check", sql`${t.rating} IN ('excellent', 'good', 'weak')`),
    check("sessions_pages_check", sql`${t.pages} IS NULL OR ${t.pages} >= 0`),
    check("sessions_valid_ayah_range", sql`${t.from_ayah} <= ${t.to_ayah}`),
    index("idx_sessions_student").on(t.student_id, t.session_date),
    index("idx_sessions_teacher").on(t.teacher_id, t.session_date),
  ],
);

export const attendanceTable = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    student_id: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id),
    teacher_id: uuid("teacher_id").references(() => usersTable.id),
    attendance_date: date("attendance_date").notNull(),
    status: text("status").notNull(),
    // True for manually-entered records (excused absences, holidays, manual
    // present/absent). False for auto-derived rows from sessions. Manual
    // records are preserved by recalculateStudentAttendance and never
    // overwritten by the auto-derivation.
    recorded_manually: boolean("recorded_manually").notNull().default(false),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check(
      "attendance_status_check",
      sql`${t.status} IN ('present', 'absent', 'excused', 'holiday')`,
    ),
    uniqueIndex("attendance_student_id_attendance_date_key").on(
      t.student_id,
      t.attendance_date,
    ),
    index("idx_attendance_student_date").on(t.student_id, t.attendance_date),
  ],
);

export const ijazatTable = pgTable(
  "ijazat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    student_id: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id),
    granted_by: uuid("granted_by")
      .notNull()
      .references(() => usersTable.id),
    ijaza_type: text("ijaza_type").notNull(),
    juz_number: integer("juz_number"),
    sheikh_name: varchar("sheikh_name", { length: 100 }).notNull(),
    ijaza_date: date("ijaza_date").notNull(),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("ijazat_ijaza_type_check", sql`${t.ijaza_type} IN ('juz', 'full_quran')`),
    check("ijazat_juz_number_check", sql`${t.juz_number} IS NULL OR ${t.juz_number} BETWEEN 1 AND 30`),
    check(
      "juz_required_if_type",
      sql`(${t.ijaza_type} = 'juz' AND ${t.juz_number} IS NOT NULL) OR (${t.ijaza_type} = 'full_quran' AND ${t.juz_number} IS NULL)`,
    ),
  ],
);

export const initialMemorizationTable = pgTable(
  "initial_memorization",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    student_id: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id),
    juz_number: integer("juz_number").notNull(),
    status: text("status").notNull(),
    sheikh_name: varchar("sheikh_name", { length: 100 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check(
      "initial_memorization_juz_number_check",
      sql`${t.juz_number} BETWEEN 1 AND 30`,
    ),
    check(
      "initial_memorization_status_check",
      sql`${t.status} IN ('memorized', 'with_ijaza')`,
    ),
    uniqueIndex("initial_memorization_student_id_juz_number_key").on(
      t.student_id,
      t.juz_number,
    ),
  ],
);

// ---- Inferred row types (single source of truth for app entity types) ----

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Student = typeof studentsTable.$inferSelect;
export type NewStudent = typeof studentsTable.$inferInsert;
export type TeacherStudentAssignment = typeof teacherStudentAssignmentsTable.$inferSelect;
export type Surah = typeof surahsTable.$inferSelect;
export type JuzBoundary = typeof juzBoundariesTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;
export type Attendance = typeof attendanceTable.$inferSelect;
export type NewAttendance = typeof attendanceTable.$inferInsert;
export type Ijaza = typeof ijazatTable.$inferSelect;
export type NewIjaza = typeof ijazatTable.$inferInsert;
export type InitialMemorization = typeof initialMemorizationTable.$inferSelect;
export type NewInitialMemorization = typeof initialMemorizationTable.$inferInsert;
