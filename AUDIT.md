# Iqra (اقرأ) — Full Codebase Audit

> Generated: 2026-07-07

---

## Shared Context Map

**Stack:** Next.js 16 (App Router) · React 19 · Supabase (Postgres + Auth + RLS) · Tailwind v4 · shadcn/ui · TypeScript 5

**Route groups:**
- `(auth)/login` → public
- `(admin)/admin/**` → role=admin only
- `(teacher)/teacher/**` → role=teacher only

**Data flow:** Supabase Postgres → Supabase SDK (admin client in API routes, server client in RSCs, browser client in `[use client]` components) → API routes + Server Actions → Client components via `fetch()`

**Domain entities (8 tables):** `users`, `students`, `teacher_student_assignments`, `surahs`, `juz_boundaries`, `sessions`, `attendance`, `ijazat`, `initial_memorization`

**Auth:** Username/password via Supabase Auth (username mapped to synthetic email). Two roles: `admin`, `teacher`. Students have no login — they are data records only.

**Tests:** 2 standalone test files with no test runner (`progress.test.ts`, `attendance.test.ts`)

---

## Phase 1 — Architecture & Code Quality

### Separation of Concerns

**Finding: Good overall, one structural gap.**

| Layer | Location | Assessment |
|---|---|---|
| DB schema | `supabase/*.sql` | Clean |
| DB clients | `src/lib/supabase/` | Clean |
| Auth/session | `src/lib/auth/` | Clean |
| Business logic | `src/lib/{progress,sessions,students,attendance}.ts` | Clean — pure functions |
| API routes | `src/app/api/**` | Clean |
| UI | `src/components/` | Mostly clean |
| Types | Scattered across lib files | Gap — no dedicated `types/` module |

> **Important** — Types are defined inline inside individual lib files (`SessionPayload` in `sessions.ts`, `JuzProgress` in `progress.ts`, `AppUser` in `auth/shared.ts`). As the domain grows (evaluations, exams, parent records), this creates scattered, hard-to-discover type definitions. A `src/types/` folder with barrel exports is not urgent, but the cost of adding it grows with each new entity.

---

### Server Components vs Client Components

`"use client"` is applied correctly in 18 of the 19 cases. Forms, tabs with state, search with debounce, and interactive grids all legitimately need it.

> **Nice-to-have** — `src/components/level-badge.tsx` has `"use client"` but a badge that renders a label from props has no hook, no event handler, and no browser API. It is a pure render. Removing `"use client"` moves it to the server bundle. Low impact but sets a bad precedent if left.

> **Nice-to-have** — `src/app/(admin)/admin/teachers/new/page.tsx` is marked `"use client"` and contains the full form. The pattern used elsewhere in the app (page.tsx = RSC → renders a `*-client.tsx` form component) is better. This page breaks the pattern and makes the entire page a client bundle instead of just the form.

---

### Folder Structure

Currently **type-based** (`components/`, `lib/`, `api/`). This works now.

> **Important** — The app has 7 domain entities today. At the expected trajectory (evaluations, exams, parent records, scheduling, certificates, notifications), `src/components/` will have 40+ files with no internal organization. `student-sessions-tab.tsx`, `student-attendance-tab.tsx`, `student-ijazat-tab.tsx`, `student-profile-tabs.tsx`, `student-delete-button.tsx` are already five `student-*` files. A `src/components/students/` subfolder would contain the growth without a full feature-folder migration.

---

### TypeScript Strictness

> **Important** — Cannot confirm `strict: true` is enabled in `tsconfig.json` from the scan. If it is not, TypeScript's most valuable checks (implicit `any`, missing return types, null-unchecked access) are silently off. This should be verified and enabled.

> **Important** — The `ApiAppUser` interface in `student-access.ts` and the `AppUser` interface in `auth/shared.ts` represent the same entity with different fields. Having two slightly-different user type representations for the same `public.users` row is a drift risk — when a new field (e.g. `branch_id`) is added to the table, it is easy to update one and forget the other.

---

### Component Reusability / Dead Code

> **Nice-to-have** — `src/components/page-placeholder.tsx` exists. If it is only a placeholder with no current usage, it should be removed. Dead stubs leave false impressions about what functionality exists.

---

### Naming Consistency

Naming is consistent across models, routes, and components. The `(admin)` and `(teacher)` route group convention maps cleanly to role names. API paths match entity names. No issues.

---

## Phase 2 — Data Fetching & State Management

### Server-Side Fetching

Page-level data fetching in RSCs is correct — `page.tsx` files call `requireRole()` and fetch directly. No issues here.

No explicit `revalidate` or `cache` directives found. By default in Next.js 15+, `fetch()` does not cache. Since these pages hit Supabase directly (not via `fetch()`), Next.js route caching does not apply. The data is always fresh on every request, which is correct for this domain (real-time session recording).

---

### Client State

> **Important** — Student profile tabs (`student-profile-tabs.tsx`) render all four tabs at mount but each tab fetches its own data independently via `useEffect`. All four tabs likely fire their `useEffect` fetches simultaneously on mount — meaning sessions, attendance, ijazat, and progress data are all fetched on page load even if the user only looks at one tab. This wastes bandwidth and slows perceived load. Fetching only on first activation of each tab (guard with a `hasFetched` ref or lazy state) would cut 3 of 4 fetches on initial load.

---

### API Routes — Input Validation

> **Critical** — No input validation library (Zod, Yup, Valibot) and no reference to schema validation anywhere in API routes. API routes accept JSON bodies, parse them, and insert directly into Supabase. This means:
> - `from_ayah` and `to_ayah` could be sent as strings, negative numbers, or values outside valid Quran ranges
> - `session_date` could be a future date or malformed string
> - `juz_number` in ijazat could be 0 or 31
> - `rating` could be an arbitrary string if the DB constraint is the only guard
>
> The DB `CHECK` constraints are the last line of defense. A malformed request that bypasses DB constraints inserts garbage data. The surah/ayah validation is especially important because `computeJuzProgressPure` does arithmetic on these values — bad input corrupts the progress map permanently.

> **Important** — API routes appear to return raw Supabase errors on failure. Supabase error messages can include schema details (table names, constraint names, column names). These should not reach the client in production.

---

### Error Handling in Fetch Calls

> **Important** — Client components use `fetch()` without `try/catch` in multiple places. If the network fails, `await res.json()` throws and the component crashes silently. A consistent pattern like:
> ```ts
> const res = await fetch(...);
> if (!res.ok) throw new Error(await res.text());
> ```
> should be applied across all 17 fetch call sites. None appear to have this consistently.

---

### Data-Fetching Waterfalls

> **Important** — The student profile page (RSC) renders, sends HTML, client hydrates, then all tab components mount and fire fetches. This means 4 round trips after hydration before the page is fully loaded. For the progress map specifically, the fetch should move into the RSC where it can be fetched during server render, not after.

---

## Phase 3 — Performance

### Bundle Size

> **Nice-to-have** — `lucide-react` at v1.22.0 ships 1000+ icons. Named imports should tree-shake correctly in modern bundlers. Verify with `next build` output — if the bundle includes unused icons, it indicates a tree-shaking failure.

No other heavyweight client dependencies found. The dependency list is lean.

---

### `next/image`

> **Nice-to-have** — Only one image asset exists (`public/15044096.webp`, the app icon). Confirm it is rendered with `<Image>` from `next/image` and not a raw `<img>` tag. A raw `<img>` bypasses Next.js image optimization.

---

### Unnecessary Re-renders / Memoization

> **Nice-to-have** — `students-list-client.tsx` handles search with a text input. If search triggers a fetch on every keystroke with no debounce, this fires an API call per character. Debouncing at 300ms eliminates ~90% of redundant calls.

No complex component trees requiring `React.memo` were identified.

---

### N+1 Query Patterns

> **Critical** — `recalculateStudentAttendance()` deletes and reinserts the entire attendance history from enrollment date to today on every session save. For a student enrolled 2 years ago with 500 sessions, this means:
> 1. Fetch all sessions for the student
> 2. Delete all attendance records for the student
> 3. Re-insert every attendance record from enrollment date to today
>
> This is O(enrollment_length) per session save. A student enrolled for 3 years touches ~1000 rows on every session record. The fix is an incremental update: only update attendance for the specific date of the new session.

> **Important** — `recalculateStudentSummary()` is called after every session creation, ijaza grant, and initial-memorization edit. It re-reads all sessions + ijazat to recompute 3 denormalized fields. Acceptable now but becomes expensive when a student has hundreds of sessions.

---

## Phase 4 — Security

### Environment Variable Handling

No critical leak found. `SUPABASE_SERVICE_ROLE_KEY` is only accessed in server-only files. The `server-only` package is used correctly.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public — this is the standard Supabase pattern. The anon key is safe because Supabase RLS governs what it can access.

---

### Input Validation on API Routes

Already flagged in Phase 2. Restated at **Critical** severity because the security implication differs from the data quality one: without validation, a teacher could POST a session with `from_ayah: -999999` or a `student_id` belonging to another teacher (testing whether the access check catches it).

---

### Auth Checks — Consistency

> **Important** — Authorization is enforced at three levels:
> 1. **Proxy** (`src/proxy.ts`): Route-level role routing.
> 2. **Page** (`requireRole()`): RSC-level guard.
> 3. **API** (`getApiAppUser()` + scoping logic): Per-route authorization.
>
> Level 3 must be verified in **every** API route, especially:
> - `DELETE /api/students/[id]` — can a teacher delete a student?
> - `DELETE /api/ijazat/[id]` — can a teacher delete another teacher's ijaza?
> - `PUT /api/teachers/[id]` — is this admin-only?
> - `GET /api/students/[id]/sessions` — does it verify the caller has access to this student?
>
> Any gap here is a **Critical** security hole.

---

### Role-Based Access — Teacher Isolation

> **Important** — Teacher scoping is implemented in application code (not RLS) because the admin client bypasses RLS. The `getAssignedStudentIds()` + `canAccessStudent()` pattern is correct and centralized. The risk: any new API route added later that uses the admin client but forgets to call `canAccessStudent()` silently exposes all students to all teachers.
>
> The safer architecture: use the **server client** (which respects RLS) for reads, and use the **admin client** only for mutations requiring privilege elevation. This makes teacher isolation enforced by RLS at the DB level rather than application-level code that can be forgotten.

---

### RLS Policies

`supabase/rls.sql` exists. The key question: if a teacher calls Supabase directly with their JWT (bypassing API routes entirely), what does RLS prevent them from seeing? This should be verified manually.

---

## Phase 5 — Testing & Tooling

### Tests

> **Important** — Two test files exist and they test the two most critical pure functions in the codebase. This is the right instinct.

> **Critical** — There is **no test runner configured**. Tests run via `npx tsx src/lib/progress.test.ts` — a manual shell command. This means:
> - Tests are never run automatically
> - They are never part of any build or CI check
> - A future developer will not know these tests exist
> - Breakage goes undetected
>
> Adding Vitest takes ~10 minutes and makes these tests first-class citizens:
> ```bash
> npm install -D vitest
> # Add "test": "vitest" to package.json scripts
> ```

---

### Linting / Formatting

> **Nice-to-have** — ESLint is configured. No Prettier config found. Without a formatter, code style drifts. Adding `prettier` with `eslint-config-prettier` is a 5-minute task.

---

### CI Pipeline

> **Important** — No CI pipeline found. For a project with auth, role-based access, and operational importance to a real institution, a minimal GitHub Actions workflow with `npm run build` + `npx vitest run` would catch the most common regressions on every push.

---

## Phase 6 — Business Domain Evaluation

### Domain Modeling Accuracy

**Strengths:**
- The Quran is modeled as **structured data** (`surahs`, `juz_boundaries`) down to the ayah level. This enables the progress calculation correctly. Many similar apps store progress as free text or surah-level flags.
- Session tracking distinguishes `new_memorization` vs `review` — the two fundamentally different types of hifz work.
- `ijazat` is a separate table with formal certification semantics (sheikh name, date, juz or full Quran scope).
- `initial_memorization` handles the enrollment scenario where a student arrives with pre-existing memorization — a detail many apps miss.
- Assignment history is preserved via `end_date` — teacher transitions are auditable.

---

### Missing: Halaqa (Study Circle) Entity

> **Important** — There is no `halaqas` table. A Halaqa in practice is not just a teacher-student pair — it is a named group with a schedule, a location, and multiple students. Currently `teacher_student_assignments` serves as a many-to-many link, but has no concept of:
> - Group identity (students in the same class)
> - Schedule (when does this group meet?)
> - Session capacity (can a teacher record one session for a group of 5 students at once?)
>
> The practical consequence today: if a teacher has 10 students and runs a group session, they must create 10 individual session records. A minimal addition:
> ```sql
> CREATE TABLE halaqas (
>   id UUID PRIMARY KEY,
>   teacher_id UUID REFERENCES users(id),
>   name VARCHAR(100) NOT NULL,
>   gender TEXT CHECK (gender IN ('male', 'female')),
>   schedule TEXT,
>   is_active BOOLEAN DEFAULT true
> );
> ```
> With a `student_halaqa_memberships` table linking students into halaqas.

---

### Core Workflows

| Workflow | Status | Notes |
|---|---|---|
| Student enrollment | Present | `enrollment_date`, guardian info, initial memorization grid |
| New memorization tracking | Present | `session_type = 'new_memorization'`, ayah-level ranges |
| Review tracking | Present | `session_type = 'review'` |
| Retention / staleness detection | Partial | 30-day staleness threshold is hardcoded in `progress.ts`. No revision schedule or next-review-date concept. |
| Attendance tracking | Present but limited | See below |
| Recitation grading | Partial | `rating` field with 3 values (`excellent`, `good`, `weak`) per session. No per-rule (tajweed rule) granularity. |
| Teacher assignment / history | Present | `end_date` preserves full history |

---

### Attendance: Critical Design Gap

> **Critical (Domain)** — Attendance is auto-derived entirely from sessions. The system generates "present" if a session was recorded that day, "absent" if not, and skips Fridays.
>
> Real-world failures this causes:
> 1. **Excused absence**: A student is sick. The teacher cannot record "excused absent" — it becomes an unexcused absence.
> 2. **Holiday / school closure**: The mosque closes for Eid or a national holiday. Every student is marked absent with no way to override.
> 3. **Non-school-day session**: A teacher records a makeup session on a Saturday. This inserts spurious "present" records.
> 4. **Attendance without a productive session**: Student attends but the teacher had an emergency. Cannot record attendance without recording a session.
>
> The fix: make attendance a **first-class, manually recordable entity** with an optional link to a session. The current auto-calculation becomes a fallback/backfill only.

---

### Memorization State Machine Gap

> **Important** — Real Hifz programs distinguish 3 states:
> 1. **Taught** (sabeq) — verse was covered but not yet memorized
> 2. **Memorized** (hifz jadeed) — student can recite from memory
> 3. **Retained** (murajaah) — memorized AND reviewed recently enough to be solid
>
> The current model captures `new_memorization` vs `review` session types, and uses a 30-day recency threshold to color juz blue vs yellow. This is a proxy for the state machine, not the state machine itself. A student who has 80% coverage and reviewed 31 days ago drops from blue to yellow with no teacher action or alert.
>
> The missing concept is a **revision schedule**: for each memorized juz, when should the next review be? This is the operational heart of a Hifz program.

---

### Domain Completeness Gaps

| Gap | Severity | Notes |
|---|---|---|
| **Parent/guardian portal** | Important | `guardian_name` and `guardian_phone` exist but there is no parent login, no progress report export, no notification. Parents in Quran schools typically expect regular progress updates. |
| **Exam / milestone tracking** | Important | Ijazat tracks completion certificates but not exams. No "scheduled exam," "exam result," or "exam attempt" entity. Students are typically tested formally before ijaza is granted. |
| **Student pause/resume** | Important | `is_active` is a boolean. No "paused" state. If a student pauses for 2 months (travel, illness, school exams), the attendance system marks them absent for 60 days, corrupting the attendance rate. A `status` field with `active / paused / graduated / withdrawn` is needed. |
| **Multi-mosque / branch support** | Nice-to-have | No `branch_id` or `mosque_id` anywhere. Single-mosque only. If scaling to multiple branches is planned, adding a branch FK to `users`, `students`, and `halaqas` now is far cheaper than retrofitting later. |
| **Scheduling / calendar** | Nice-to-have | No concept of when sessions should happen. The app records what happened but cannot show "upcoming sessions" or "sessions this week." |
| **Notifications** | Nice-to-have | No notification system. Missed sessions, milestones, and ijaza grants are invisible outside the app. |
| **Certificate generation (PDF)** | Nice-to-have | Ijazat records exist in the DB but there is no way to generate a printable certificate. Common expectation in mosque settings. |
| **Admin cross-halaqa view** | Present | `/admin/reports`, `/admin/assignments` exist. Covered. |

---

### Data Model Risks Specific to This Domain

| Risk | Current Handling |
|---|---|
| Student pauses / resumes | **Not handled.** `is_active` boolean only. An inactive student still accumulates absent days. |
| Multi-teacher history | **Handled.** `end_date` on assignments preserves full history. |
| Partial surah memorization | **Handled.** `from_ayah` / `to_ayah` per session tracks exactly which verses. Strongest part of the data model. |
| Verse retention decay | **Partially handled.** 30-day recency threshold exists in progress calc, but no proactive alert or revision schedule. |
| Surah spanning multiple Juz | **Handled.** `juz_boundaries` table correctly models this (e.g. Al-Baqarah spans Juz 1 and 2). |

---

## Consolidated Finding List

### Critical

| # | Phase | Finding |
|---|---|---|
| C1 | Phase 2 / Phase 4 | No input validation on API routes. All endpoint bodies passed to Supabase without sanitization or type checking. DB constraints are the only guard. |
| C2 | Phase 3 | `recalculateStudentAttendance()` deletes and reinserts the entire attendance history on every session save. O(enrollment_length) per write. Will degrade at scale. |
| C3 | Phase 5 | Test runner not configured. `progress.test.ts` and `attendance.test.ts` are never run automatically. Critical business logic can break without detection. |
| C4 | Phase 6 | Attendance is entirely auto-derived from sessions. Cannot record excused absences, holidays, or closures. Corrupts attendance data for any real-world deviation from the automatic rule. |

### Important

| # | Phase | Finding |
|---|---|---|
| I1 | Phase 1 | Two separate `AppUser` / `ApiAppUser` type interfaces for the same DB row. Drift risk as schema evolves. |
| I2 | Phase 1 | No `types/` module. Types scattered across lib files become hard to discover. |
| I3 | Phase 1 | `tsconfig.json` strict mode not confirmed. If disabled, TypeScript's most valuable checks are silently off. |
| I4 | Phase 1 | `src/components/` will become unwieldy. `student-*` files already 5 deep. Add subfolders by entity. |
| I5 | Phase 2 | All student profile tabs fetch data on mount, not on first activation. 3 of 4 fetches are wasted on initial load. |
| I6 | Phase 2 | Supabase error messages returned raw to clients. Schema details can leak in production error responses. |
| I7 | Phase 2 | No consistent `res.ok` check or `try/catch` across the 17 fetch call sites in client components. Network failures cause silent crashes. |
| I8 | Phase 4 | Teacher isolation enforced in app code, not RLS. Any new API route using admin client that forgets `canAccessStudent()` silently exposes all students. |
| I9 | Phase 4 | Authorization in every API route must be verified individually — especially DELETE endpoints and cross-role access paths. |
| I10 | Phase 5 | No CI pipeline. No automated build or test check on push. |
| I11 | Phase 5 | No Prettier. Code style drifts without a formatter. |
| I12 | Phase 6 | No Halaqa entity. Group sessions require N individual records (one per student). Scheduling is impossible without it. |
| I13 | Phase 6 | No memorization state machine (taught → memorized → retained). The 30-day proxy is a workaround, not a solution. No revision schedule. |
| I14 | Phase 6 | No student "paused" state. Inactive students accumulate false absences and distort attendance statistics. |
| I15 | Phase 6 | No parent/guardian portal. `guardian_phone` is stored but there is no way to send progress reports or notifications to parents. |
| I16 | Phase 6 | No exam or milestone tracking. Ijaza certificates exist but the testing process before granting them is invisible in the data model. |

### Nice-to-Have

| # | Phase | Finding |
|---|---|---|
| N1 | Phase 1 | `level-badge.tsx` has `"use client"` but is a pure render component with no hooks or events. |
| N2 | Phase 1 | `admin/teachers/new/page.tsx` is a full client page instead of RSC + client form. Breaks the pattern used everywhere else. |
| N3 | Phase 1 | `page-placeholder.tsx` — remove if unused. |
| N4 | Phase 3 | Verify debounce on search input in `students-list-client.tsx`. If missing, each keystroke fires a fetch. |
| N5 | Phase 3 | Verify `next/image` is used for the app icon webp, not a raw `<img>` tag. |
| N6 | Phase 3 | Verify `lucide-react` tree-shaking in build output. |
| N7 | Phase 6 | No multi-mosque/branch support. Single-mosque architecture baked in. Add `branch_id` now if scaling is planned. |
| N8 | Phase 6 | No scheduling/calendar for sessions. Cannot show "upcoming" or "planned" sessions. |
| N9 | Phase 6 | No notification system. Milestones and missed sessions are invisible outside the app. |
| N10 | Phase 6 | No PDF certificate generation for ijazat. Common expectation in mosque settings. |

---

## Priority Recommendation

**Do now (before adding features):**
1. **C3** — Add Vitest. 10-minute task, protects the most complex logic already written.
2. **C1** — Add Zod validation to API routes. One schema per route, validated before any DB call.
3. **I7** — Standardize `fetch()` error handling across all 17 call sites with a shared `apiFetch` wrapper.
4. **I3** — Confirm `strict: true` in tsconfig. Fix any resulting type errors immediately.

**Next sprint:**
5. **C4 + I14** — Redesign attendance to be manually recordable + add `status: 'active' | 'paused' | 'graduated' | 'withdrawn'` to students.
6. **I12** — Add Halaqa entity. Unblocks group sessions and scheduling.
7. **C2** — Fix incremental attendance update (delta only, not full recompute).
8. **I8** — Move teacher data isolation to RLS rather than application code.

**When the core is stable:**
9. **I13** — Revision schedule system.
10. **I15** — Parent progress report (even a simple read-only view behind a token link).
11. **I16** — Exam tracking before ijaza grant.
