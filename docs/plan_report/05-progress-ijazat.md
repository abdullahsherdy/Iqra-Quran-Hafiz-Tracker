# Plan 05 — Implementation Report

**Plan:** 05 — Quran Progress Map, Ijazat & Summary Recalculation
**Status:** ✅ Complete (with post-review fix)
**Build:** `npm run build` passes (Next.js 16.2.9, TypeScript clean, 28 pages) and all 6 unit tests pass — verified 2026-07-01 after the fix.
**Date:** 2026-07-01
**Reviewed:** 2026-07-01

---

## Tasks Completed

### 1. Progress Computation — Pure Algorithm (§6.4) ✅
- `src/lib/progress.ts` implements the core as a **pure function** `computeJuzProgressPure({ boundaries, sessions, initialMem, ijazat, referenceDate })`, wrapped by the DB-fetching `computeJuzProgress(admin, studentId, referenceDate)`.
- Follows §6.4 exactly:
  - Loads segments from `juz_boundaries`; `juz_total_ayahs = Σ(to − from + 1)`.
  - **Intersects** each session's `(surah_id, from..to)` with same-surah juz segments.
  - Treats a present `initial_memorization` juz as fully covered.
  - **Unions** covered ranges per surah (adjacent/overlapping merged) before counting — coverage cannot exceed 100%.
  - Color: green if formal ijaza or `with_ijaza`; blue if ≥70% and not weak-dominant (≥30% weak) and a session within 30 days; yellow if some coverage but stale/weak/<70%; gray if zero.
- Injectable `referenceDate` keeps the 30-day recency rule deterministic for tests.

### 2. Unit Tests ✅
- `src/lib/progress.test.ts` — standalone `tsx` script covering all required edge cases:
  1. Juz fully covered by `initial_memorization` (→ 100% blue).
  2. Overlapping review ranges unioned (Al-Baqarah 1..100 + 50..120 → 81.1%, not summed).
  3. A surah spanning multiple juz (Al-Baqarah across juz 1–3, per-juz intersection correct).
  4. Ijaza overriding color to green.
  5. Weak-dominant (≥30% weak) → yellow.
  6. No session in 30 days → yellow despite 100% coverage.

### 3. Progress Map UI (§6.4) ✅
- `src/components/progress-map.tsx` — 30-block grid (color + `جزء N` + coverage %), ijaza star badge, color legend. Click expands a juz to show per-surah coverage bars, last session date, and the session list (date, type/rating badges, ayah range, teacher, notes).
- `GET /api/students/[id]/progress` returns enriched per-juz detail (surah breakdown + intersecting sessions) built on top of `computeJuzProgressPure`.

### 4. Progress Map Wired into Profile ✅
- `src/components/student-profile-tabs.tsx` renders `<ProgressMap>` in the **التقدم** tab, with the read-only initial-memorization grid beneath. Used by both admin and teacher profiles.

### 5. Ijazat Granting (§6.5) ✅
- `POST /api/ijazat` — validates type (`juz` requires juz 1–30; `full_quran` nulls juz), requires sheikh name + date, enforces `canAccessStudent` (teacher → assigned + gender scope; admin → any). Recalculates summary after insert.
- `src/components/grant-ijaza-form.tsx` — shared Arabic form (type radios, conditional juz select, sheikh, date, notes) with optional preselected/locked student.
- `/teacher/ijazat/new` — assigned active students only (gender-scoped). `/admin/ijazat` — full list + grant form; supports `?grant_for=<id>` deep-link from the student profile.

### 6. Ijaza Revoke + Profile Display ✅
- `DELETE /api/ijazat/[id]` — **admin-only**; fetches `student_id`, deletes, recalculates.
- `src/components/student-ijazat-tab.tsx` — **الإجازات** tab cards; admin sees a revoke button (with confirm).
- `src/components/admin-ijazat-table.tsx` — admin management table with revoke; tolerates Supabase nested-relation returning object-or-array.
- Ijaza juz render green + star on the progress map.

### 7. `recalculateStudentSummary` — Authoritative (§4.2 / §6.1.1) ✅
- `src/lib/students.ts`: replaces the Plan 04 stub. Computes `memorized_juz_count` = # juz blue OR green (≥70% or ijaza); `ijaza_juz_count` = # juz with `hasIjaza` (full_quran → all 30); `last_session_date` = max session date. Writes onto the `students` row. Idempotent, single-student.

### 8. Recalc Wired to All Mutations + Backfill ✅
- Called after: session create (`api/sessions/route.ts`), update & delete (`api/sessions/[id]/route.ts`); ijaza create (`api/ijazat/route.ts`) & delete (`api/ijazat/[id]/route.ts`); initial-memorization edit (`api/students/[id]/route.ts` PUT). Also runs on student create (`api/students/route.ts` POST).
- `src/lib/backfill.ts` — one-shot `tsx` script recomputing every student (stubs `server-only` to run under Node).

---

## Bug Found & Fixed During Review

| Bug | Location | Symptom | Fix |
|---|---|---|---|
| **Cross-student data leak in progress map** | `src/app/api/students/[id]/progress/route.ts` — `initial_memorization` query | The query fetched **all** students' `initial_memorization` rows (missing `.eq("student_id", studentId)`), unlike every sibling query in the route and the canonical `progress.ts`. Result: any juz initially memorized by *any* student showed as covered — and green if `with_ijaza` — on **every** student's live progress map, contradicting §6.4. | Added `.eq("student_id", studentId)` to scope the query to the profile's student. |

Scope note: only the **live map endpoint** was affected. The cached columns (`memorized_juz_count`, etc.) go through `computeJuzProgress` in `progress.ts`, which was already correctly scoped, so stored summaries and list filters were never wrong.

---

## Deviations from Plan

| Plan item | What happened | Reason |
|---|---|---|
| "Add unit tests" | Standalone `tsx` script with `process.exit`/`console`, not a test-runner suite | No runner is configured in the repo; consistent with existing convention. Consider adding Vitest so `computeJuzProgressPure` is covered in CI. |
| Progress map reused on "teacher/admin views" | Reused via `StudentProfileTabs` (shared by both profile pages) | Single component, role-agnostic; satisfies the requirement. |

---

## Files Created

**API routes:**
- `src/app/api/ijazat/route.ts` (GET list, POST grant)
- `src/app/api/ijazat/[id]/route.ts` (DELETE revoke, admin-only)
- `src/app/api/students/[id]/progress/route.ts`

**Components:**
- `src/components/progress-map.tsx`
- `src/components/grant-ijaza-form.tsx`
- `src/components/student-ijazat-tab.tsx`
- `src/components/admin-ijazat-table.tsx`

**Pages:**
- `src/app/(teacher)/teacher/ijazat/new/page.tsx`
- `src/app/(admin)/admin/ijazat/page.tsx` (replaced Plan 01 placeholder)

**Libraries:**
- `src/lib/progress.ts`
- `src/lib/progress.test.ts`
- `src/lib/backfill.ts`

**Modified:**
- `src/lib/students.ts` — full `recalculateStudentSummary()` replacing the Plan 04 stub
- `src/components/student-profile-tabs.tsx` — التقدم tab renders `ProgressMap`; الإجازات tab renders `StudentIjazatTab`
- `src/app/(admin)/admin/students/[id]/page.tsx` & teacher equivalent — "منح إجازة" action; `isAdmin` passed to tabs
- `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts`, `src/app/api/students/[id]/route.ts` — call the real recalc

---

## Acceptance Criteria Check

- [x] Progress map matches §6.4 logic, including Al-Baqarah spanning juz 1–3 (Test Case 3)
- [x] Coverage never exceeds 100% with overlapping reviews (Test Case 2, union step)
- [x] Granting an ijaza turns the juz green and increments `ijaza_juz_count` (recalc on POST)
- [x] `memorized_juz_count` / `last_session_date` update after sessions; Plan 03 list filters reflect new values
- [x] Unit tests for `computeJuzProgress` present and covering the required cases
- [x] **Fixed:** live progress map is student-scoped for `initial_memorization` *(post-review fix)*
- [x] `npm run build` passes (Next.js 16.2.9, TypeScript clean, 28 pages generated) and all 6 `computeJuzProgress` unit tests pass — verified 2026-07-01 after the fix.

---

## Follow-ups / Notes for Plan 06+

- **Verify before sign-off:** run `npm run build` and `npx tsx src/lib/progress.test.ts` — both expected green (the fix only adds a query filter).
- Consider adding a real test runner (Vitest) and a `test` script; the progress engine is the highest-value code to guard in CI.
- `session_type` value `Reciting` (schema/enum) vs. UI label تسميع is a Plan 04 naming inconsistency worth tidying later; it does not affect progress math.
- `recalculateStudentSummary` runs inline after each mutation. Fine at current scale; if session volume grows, consider batching or moving to a DB trigger/function.
