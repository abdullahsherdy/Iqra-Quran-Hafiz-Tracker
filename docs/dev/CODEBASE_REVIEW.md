# Iqra (اقرأ) — Codebase Review

> Generated: 2026-07-31 · Branch: `dev` (commit `e18b37f`)
> Supersedes the prior `AUDIT.md` (2026-07-07) — findings verified against current code, stale items corrected, new issues surfaced.

---

## Stack

Next.js 16 (App Router) · React 19 · Supabase (Postgres + Auth + RLS) · Tailwind v4 · shadcn/ui · TypeScript 5 (`strict: true`). Arabic/RTL UI. Path alias `@/*` → `src/*`.

---

## What's done well

- **Auth layer is clean and correctly layered.** Proxy (`src/proxy.ts` → `src/lib/supabase/proxy.ts`) handles route-level role routing + session refresh; `requireRole()` guards RSCs; API routes re-check per-request. Three independent layers, no gaps in the critical paths checked (`DELETE /api/students/[id]` and `DELETE /api/ijazat/[id]` are admin-only; `DELETE /api/sessions/[id]` checks ownership).
- **Four-client Supabase pattern is applied correctly** — server component (readonly cookies), server action (writable), browser, admin (service-role, server-only). All return `null` on missing env and every caller null-checks.
- **RLS is genuinely enforced at the DB level** — `rls.sql` has `is_assigned()` + gender scoping + `is_admin()` policies on students/sessions/ijazat. Direct JWT access is protected by RLS; the app-code checks in API routes are a second layer for the admin-client paths.
- **Pure/impure split in `progress.ts` is preserved**, with injectable `referenceDate` for deterministic tests. The range-intersection + per-surah unioning logic is correct.
- **Session validation was added** since the prior audit — `validateSessionPayload` checks enums, ayah ranges against `surahs.total_ayahs`, and pages ≥ 0.
- **RTL is set correctly** (`<html lang="ar" dir="rtl">` + `direction: rtl` in globals), Cairo font, Arabic strings throughout.
- **Search debounce exists** (400ms in `students-list-client.tsx`).
- **Icon is via `metadata.icons`** (Next.js handles it, not a raw `<img>`).
- **Student profile tabs do NOT have the wasteful-fetch problem the prior audit claimed.** Tabs use conditional rendering (`{activeTab === "sessions" && <StudentSessionsTab />}`), so only the active tab mounts and fetches. Prior audit's I5 was incorrect.

---

## Findings

### Critical

**C1. `is_active` column dropped but still selected — runtime breakage.**
The migration `supabase/migrations/add_student_status.sql` drops `students.is_active` and replaces it with `status`. But two API routes still select the dropped column:
- `src/app/api/assignments/route.ts:27` — `select("..., is_active, ...")` on students → breaks `GET /api/assignments` (the admin assignments page).
- `src/app/api/teachers/[id]/route.ts:42` — same, breaks the teacher profile's assignment list.

`npm run build` passes because Supabase query results are untyped (no generated DB types), so TypeScript can't see the drift. At runtime PostgREST returns a "column does not exist" error. Fix: select `status` instead and derive active-ness via `status === 'active'` where needed.

**C2. Paused/withdrawn students still accumulate absences.**
The `status` field was added, but `computeAttendanceCalendar` was never updated to respect it — it iterates unconditionally from `enrollment_date` to today, marking every non-session, non-Friday day as `absent`. A student paused for 2 months gets ~50 false absences that corrupt the attendance rate. (`src/lib/attendance.ts:15-26`) Fix: stop the calendar at the pause date (or skip paused ranges), and exclude withdrawn students entirely.

**C3. `recalculateStudentAttendance` is O(enrollment_length) per session save.**
Deletes *all* attendance rows and reinserts the entire history from enrollment date to today on every session create/update/delete. (`src/lib/attendance.ts:57-68`) For a student enrolled 3 years, that's ~1000 rows touched per write. Should be an incremental upsert for the single affected date.

**C4. Attendance is entirely auto-derived from sessions.**
No way to record excused absences, holidays, or closures. `attendance.status` is locked to `present`/`absent` (the `late` value was removed by migration). Domain design gap that causes real data corruption for any real-world deviation.

**C5. No test runner.**
`progress.test.ts` and `attendance.test.ts` exist but only run via manual `npx tsx`. Not in build, not in CI. Adding Vitest is a 10-minute task that protects the most complex logic.

### Important

**I1. `validateInitialMemorization` is incomplete.**
Only checks that `sheikh_name` is present when `status === 'with_ijaza'`. Does **not** validate `juz_number` is in 1–30, nor that `status` is one of the allowed enum values (`memorized` | `with_ijaza`). (`src/lib/students.ts:25-34`) A teacher POSTing `juz_number: 999` or `status: "foo"` via `POST/PUT /api/students` relies on the DB CHECK constraint as the only guard — which then surfaces as a raw PostgREST error (see I3).

**I2. Students POST/PUT lack enum/range validation.**
`POST /api/students` checks required fields and gender scoping, but doesn't validate `gender` is `male`/`female`, doesn't validate `birth_date`/`enrollment_date` are real dates, and doesn't range-check `initial_memorization.juz_number`. (`src/app/api/students/route.ts:176-198`) The session and ijazat routes were hardened since the audit; the students routes were not.

**I3. Raw Supabase errors returned to clients.**
Most routes do `return Response.json({ error: error.message }, { status: 500 })`. Supabase/PostgREST error messages can leak schema details (table/constraint/column names). Should be sanitized to a generic message in production while logging the full error server-side. Present in nearly every route.

**I4. `schema.sql` is stale relative to migrations.**
`schema.sql` declares `attendance.status` includes `'late'` and has `UNIQUE (student_id, attendance_date)` + `teacher_id NOT NULL`, but migration `2026-07-02-attendance-auto.sql` removed `'late'`, dropped the unique constraint, and made `teacher_id` nullable. `schema.sql` is meant to be the source of truth but has drifted. Either regenerate it from the live DB or annotate it as "initial schema, see migrations/ for deltas."

**I5. `AppUser` vs `ApiAppUser` type drift.**
Two interfaces for the same `public.users` row: `AppUser` (`auth/shared.ts`) has `name`/`username`/`isActive`; `ApiAppUser` (`student-access.ts`) has `gender`/`can_view_all_genders`. Adding a field (e.g. `branch_id`) risks updating one and forgetting the other. Consolidate into a single `User` type, or generate types from the DB.

**I6. No CI pipeline.**
No `.github/workflows/`. A project with auth + RLS + operational importance should at least run `npm run build` on every push. Combined with C5 (no test runner) and the untyped Supabase queries, regressions like C1 only surface at runtime in production.

### Nice-to-have

**N1.** `level-badge.tsx` has unnecessary `"use client"` — pure render, no hooks/handlers.
**N2.** `admin/teachers/new/page.tsx` is a full client page, breaking the RSC + `*-client.tsx` form pattern used elsewhere.
**N3.** `page-placeholder.tsx` is dead code — not imported anywhere.
**N4.** `lucide-react` v1.22.0 — verify tree-shaking in build output; named imports should tree-shake but worth a quick check of the bundle.

---

## Domain gaps (roadmap, not bugs)

No `halaqas` table (group sessions require N individual records), no revision schedule, no exam/milestone tracking, no parent portal, no PDF certificate generation, no multi-branch support.

---

## Priority

1. **C1** — fix the two `is_active`-on-students selects. Runtime breakage, ~5 min fix.
2. **C2** — make attendance respect `status`. Real data corruption for paused students.
3. **C5 + I6** — add Vitest + a minimal CI workflow. Cheap, prevents future C1-style drift.
4. **I1 + I2** — harden `validateInitialMemorization` and students POST/PUT to match the session validator.
5. **C3** — incremental attendance update.
6. **I3** — sanitize error responses.
7. **I4** — reconcile `schema.sql` with migrations (or document it as initial-only).

The codebase is well-architected overall — the auth/client layer, RLS, and progress engine are solid. The main risks are the schema-migration drift (C1, I4), the attendance design (C2, C4), and the lack of automated safety nets (C5, I6) that let drift slip through.
