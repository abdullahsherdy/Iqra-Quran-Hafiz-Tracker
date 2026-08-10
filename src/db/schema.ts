import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
  (t) => [check("users_role_check", sql`${t.role} IN ('admin', 'teacher', 'super_admin')`), check("users_gender_check", sql`${t.gender} IS NULL OR ${t.gender} IN ('male', 'female')`)],
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

/**
 * Page-level breakdown of each juz in the standard Hafs Madani mushaf.
 * Maps each page within a juz to the surah(s) and ayah range(s) it contains.
 * Used for exact ayah-level coverage computation when a student has memorized
 * N pages of a juz (partial initial memorization).
 *
 * Note: most juz have 20 pages, but some have 21 and Juz 30 has 23.
 * Total: 608 rows. The `mushaf_page` field is the physical page number in the
 * 604-page mushaf (two rows can share the same mushaf_page when a page spans
 * two juz).
 */
export const juzPagesTable = pgTable(
  "juz_pages",
  {
    juz_number: integer("juz_number").notNull(),
    page_number: integer("page_number").notNull(),
    mushaf_page: integer("mushaf_page").notNull(),
    surah_id: integer("surah_id")
      .notNull()
      .references(() => surahsTable.id),
    from_ayah: integer("from_ayah").notNull(),
    to_ayah: integer("to_ayah").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.juz_number, t.page_number, t.surah_id] }),
    check("juz_pages_juz_number_check", sql`${t.juz_number} BETWEEN 1 AND 30`),
    check("juz_pages_page_number_check", sql`${t.page_number} BETWEEN 1 AND 23`),
    check("juz_pages_valid_ayah_range", sql`${t.from_ayah} <= ${t.to_ayah}`),
    index("idx_juz_pages_juz").on(t.juz_number, t.page_number),
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
    // Overall rating for the session (aggregates all items).
    overall_rating: text("overall_rating").notNull(),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check(
      "sessions_overall_rating_check",
      sql`${t.overall_rating} IN ('excellent', 'good', 'weak')`,
    ),
    index("idx_sessions_student").on(t.student_id, t.session_date),
    index("idx_sessions_teacher").on(t.teacher_id, t.session_date),
  ],
);

/**
 * Session items — each session contains one or more items representing
 * a Quran portion (surah + ayah range) that was recited. An item can be
 * either "new_memorization" (تسميع جديد) or "review" (مراجعة). This allows
 * a single session to include both new memorization and review portions.
 */
export const sessionItemsTable = pgTable(
  "session_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessionsTable.id, { onDelete: "cascade" }),
    session_type: text("session_type").notNull(),
    surah_id: integer("surah_id")
      .notNull()
      .references(() => surahsTable.id),
    from_ayah: integer("from_ayah").notNull(),
    to_ayah: integer("to_ayah").notNull(),
    rating: text("rating").notNull(),
    pages: integer("pages"),
    notes: text("notes"),
  },
  (t) => [
    check(
      "session_items_type_check",
      sql`${t.session_type} IN ('new_memorization', 'review')`,
    ),
    check("session_items_rating_check", sql`${t.rating} IN ('excellent', 'good', 'weak')`),
    check("session_items_pages_check", sql`${t.pages} IS NULL OR ${t.pages} >= 0`),
    check("session_items_valid_ayah_range", sql`${t.from_ayah} <= ${t.to_ayah}`),
    index("idx_session_items_session").on(t.session_id),
  ],
);

export const attendanceTable = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    student_id: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id),
    attendance_date: date("attendance_date").notNull(),
    status: text("status").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check(
      "attendance_status_check",
      sql`${t.status} IN ('present')`,
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
    // Number of pages memorized in this juz (Hafs Madani mushaf).
    // NULL = full juz. 1-N = partial memorization (N varies per juz, max 23).
    pages: smallint("pages"),
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
    check(
      "initial_memorization_pages_check",
      sql`${t.pages} IS NULL OR (${t.pages} BETWEEN 1 AND 23)`,
    ),
    uniqueIndex("initial_memorization_student_id_juz_number_key").on(
      t.student_id,
      t.juz_number,
    ),
  ],
);

// ---- Inferred row types (single source of truth for app entity types) ----

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id"),
    username: varchar("username", { length: 50 }),
    action: varchar("action", { length: 50 }).notNull(),
    entity_type: varchar("entity_type", { length: 50 }).notNull(),
    entity_id: uuid("entity_id"),
    method: varchar("method", { length: 10 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    status_code: integer("status_code").notNull(),
    request_body: jsonb("request_body"),
    response_body: jsonb("response_body"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_logs_user").on(t.user_id, t.created_at),
    index("idx_audit_logs_entity").on(t.entity_type, t.entity_id, t.created_at),
    index("idx_audit_logs_action").on(t.action, t.created_at),
    index("idx_audit_logs_created").on(t.created_at),
  ],
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Student = typeof studentsTable.$inferSelect;
export type NewStudent = typeof studentsTable.$inferInsert;
export type Surah = typeof surahsTable.$inferSelect;
export type JuzBoundary = typeof juzBoundariesTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;
export type SessionItem = typeof sessionItemsTable.$inferSelect;
export type NewSessionItem = typeof sessionItemsTable.$inferInsert;
export type Attendance = typeof attendanceTable.$inferSelect;
export type NewAttendance = typeof attendanceTable.$inferInsert;
export type Ijaza = typeof ijazatTable.$inferSelect;
export type NewIjaza = typeof ijazatTable.$inferInsert;
export type InitialMemorization = typeof initialMemorizationTable.$inferSelect;
export type NewInitialMemorization = typeof initialMemorizationTable.$inferInsert;
export type AuditLog = typeof auditLogsTable.$inferSelect;
export type NewAuditLog = typeof auditLogsTable.$inferInsert;
