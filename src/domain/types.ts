/**
 * Shared domain types — pure, no I/O dependencies.
 *
 * These enum-like types are used by the pure domain functions in
 * `domain/progress.ts`, `domain/attendance.ts`, `domain/sessions.ts`,
 * `domain/students.ts`, and by UI components via re-export from
 * `components/badges.tsx`.
 */

export type Rating = "excellent" | "good" | "weak";

export type SessionType = "new_memorization" | "review";

export type Gender = "male" | "female";

export type AttendanceStatus = "present";

export type StudentStatus = "active" | "paused" | "graduated" | "withdrawn";

export type AppRole = "admin" | "teacher" | "super_admin";
