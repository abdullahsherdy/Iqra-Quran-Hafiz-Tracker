# Iqra (اقرأ) — Architecture & Principles Review

> Generated: 2026-07-31 · Companion to `CODEBASE_REVIEW.md`
> Addresses: DDD vs alternatives, YAGNI/KISS/DRY compliance, SOLID, design patterns, reusability, and recommendations for scaling.

---

## 1. Current architecture snapshot

```text
src/
├── app/                      # Next.js App Router — routes only
│   ├── (auth)/login/         # public
│   ├── (admin)/admin/**      # role=admin
│   ├── (teacher)/teacher/**  # role=teacher
│   └── api/**                # REST-ish route handlers
├── components/               # flat — UI components (mix of server + client)
│   └── ui/                   # shadcn primitives
├── lib/                      # flat — domain logic + infra
│   ├── auth/                 # session, roles, student-access
│   ├── supabase/             # 4 client factories + config
│   ├── progress.ts           # core domain (pure + impure split)
│   ├── sessions.ts           # validation
│   ├── attendance.ts         # calendar + recalc
│   ├── students.ts           # level + summary recalc
│   └── arabic.ts, nav.ts
└── proxy.ts                  # edge guard (Next 16 "middleware")
```

**Style:** Type-based / layer-based organization (`components/`, `lib/`, `api/`). This is the default Next.js convention. It is **not feature-based** and **not DDD**.

---

## 2. Should you adopt DDD?

**Short answer: No — not full DDD. It would be over-engineering for this project.**

### Why not full DDD

Full DDD (aggregates, value objects, repositories, domain events, bounded contexts, application/use-case layers) pays off when:

- You have **multiple bounded contexts** with different ubiquitous languages (e.g. an e-commerce system with separate "inventory", "pricing", "shipping", "billing" languages).
- You have **complex invariants that span multiple entities** and need to be enforced atomically (e.g. "an order can only be shipped if all line items are reserved in inventory and payment is captured").
- You have **multiple persistence mechanisms** or need to swap them.

Iqra has **one bounded context** (a single halaqa/memorization program), **one persistence mechanism** (Supabase/Postgres), and the invariants are mostly **single-entity** (a session belongs to one student; an ijaza is for one juz or the full Quran). The most complex invariant — juz progress — is already correctly isolated as a pure function. Adding aggregate roots, repository interfaces, and a domain-event bus would roughly **double the code size** without solving any current problem.

### What you *should* borrow from DDD

Two ideas, applied lightly, would help as you grow:

1. **A `domain/` folder for pure business rules.** You already have the right instinct (`computeJuzProgressPure`). Generalize it: move all pure domain logic (`progress.ts`, the calendar math in `attendance.ts`, `getLevelInfo`, `countsFromInitialMemorization`, `validateSessionPayload`, `validateInitialMemorization`) into `src/domain/`. Keep them framework-agnostic and unit-testable. This is "domain layer" without the rest of DDD's ceremony.

2. **A shared `types/` (or `domain/types.ts`) for entity shapes.** Right now `AppUser`, `ApiAppUser`, `SessionPayload`, `JuzProgress`, `AttendanceDay`, `IjazaRecord` (in the component), etc. are scattered. A single source of truth for entity types prevents the `AppUser`/`ApiAppUser` drift (review finding I5) and makes the domain model legible.

### Recommended architecture: "Pragmatic feature-sliced"

Not DDD, not pure layer-based — a **middle ground** that scales with features without ceremony:

```text
src/
├── domain/                   # PURE business rules — no Supabase, no Next
│   ├── progress.ts           # computeJuzProgressPure (+ types)
│   ├── attendance.ts         # computeAttendanceCalendar (pure)
│   ├── sessions.ts           # validateSessionPayload
│   ├── students.ts           # getLevelInfo, countsFromInitialMemorization
│   └── types.ts              # Student, Session, Ijaza, User, JuzProgress...
├── infrastructure/           # side-effecting adapters
│   ├── supabase/             # the 4 client factories (current lib/supabase)
│   └── repositories/         # OPTIONAL — only if query duplication hurts
├── features/                 # vertical slices, each self-contained
│   ├── students/
│   │   ├── api/              # route handlers (current api/students/**)
│   │   ├── components/       # student-* components
│   │   └── server/           # RSC data fetchers, recalc helpers
│   ├── sessions/
│   ├── attendance/
│   ├── ijazat/
│   ├── teachers/
│   ├── assignments/
│   └── auth/
├── components/ui/            # shadcn primitives (shared)
└── app/                      # Next.js routing shell — thin, delegates to features/
```

**Why this fits Iqra:**

- Each feature (students, sessions, ijazat, …) becomes a folder containing its API, components, and server logic. When you add "exams" or "halaqas", you add a folder — you don't scatter files across `api/`, `components/`, `lib/`.
- `domain/` is pure and unit-testable without mocking Supabase. The progress engine already proves this works.
- `infrastructure/` isolates the Supabase dependency. If you ever swap ORMs or add a cache, it's one folder.
- The `app/` router stays thin — just imports from `features/`.

**Migration cost:** Low. You can do it incrementally — move `lib/progress.ts` → `domain/progress.ts` first, then move one feature at a time. No big-bang refactor.

> ⚠️ **Caveat:** Don't do this refactor *before* fixing the Critical bugs in `CODEBASE_REVIEW.md`. Stabilize first, reorganize second. Reorganizing buggy code just moves the bugs around.

---

## 3. YAGNI / KISS / DRY audit

### YAGNI — ⚠️ Mostly good, two violations

| Item | Verdict |
| --- | --- |
| `page-placeholder.tsx` | **Violation.** Built "for later", never used. Dead code. Delete it. |
| `level-badge.tsx` `"use client"` | Minor — premature client-side annotation for a server-renderable component. |
| The four-client Supabase split | **Not** a violation — all four are actively used. |
| `recalculateStudentSummary` denormalized caches | **Not** a violation — they back the list view's filters/sorts and avoid N progress recomputations. Legitimate optimization. |
| No halaqas/exams/notifications/parent-portal yet | **Good YAGNI.** These are roadmap items correctly deferred. |

**Verdict:** YAGNI is well-respected. The codebase avoids speculative generality (no abstract base classes, no plugin systems, no config-driven entity definitions). One piece of dead code (`page-placeholder`) to remove.

### KISS — ✅ Strong

- Auth is three simple layers (proxy → requireRole → per-route check), not a complex RBAC engine.
- No state management library (Redux/Zustand/Jotai) — uses `useState` + `fetch`. Correct for this scale.
- No ORM — direct Supabase queries. Correct for Supabase.
- Pure functions for the hard math (`computeJuzProgressPure`). Simple to test, simple to reason about.
- shadcn/ui instead of a custom design system.

**Verdict:** KISS is the codebase's strongest principle. Don't lose this as you grow — resist the urge to add abstractions "for flexibility".

### DRY — ❌ Significant violations (this is the main weakness)

**DRY-1. API route auth boilerplate is copy-pasted in every route (~12 routes).**
Every route handler opens with the same ~10 lines:

```ts
const supabase = await createSupabaseServerComponentClient();
if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });
const { data: { user } } = await supabase.auth.getUser();
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
const admin = createSupabaseAdminClient();
if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });
const appUser = await getApiAppUser(admin, user.id);
if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });
```

This is ~120 lines of duplication. **Fix:** a `withApiAuth(handler)` higher-order function (or a `getApiContext()` helper that returns `{ admin, appUser } | { error: Response }`). Each route shrinks to 2 lines.

**DRY-2. The progress route duplicates the entire range-unioning algorithm from `computeJuzProgressPure`.**
`src/app/api/students/[id]/progress/route.ts:103-215` re-implements the segment-intersection + per-surah unioning + coverage math that already lives in `progress.ts:156-202`. Two copies of the most complex logic in the app — if one is fixed, the other silently drifts. **Fix:** extract a `computeJuzProgressDetailedPure()` in `domain/progress.ts` that returns both the summary and the per-surah breakdown, and have both the route and `computeJuzProgress` call it.

**DRY-3. Relational join result mapping is repeated.**
The pattern `const u = a.users as unknown as { id: string; name: string } | null; return { ..., teacher_name: u?.name ?? "" }` appears in `students/[id]/assignments`, `students/[id]/sessions`, `students/[id]/attendance`, `assignments`, `teachers/[id]`. **Fix:** with generated DB types (see recommendation below) this becomes type-safe and the cast disappears; or a small `pickTeacherName(join)` helper.

**DRY-4. `is_active` derivation duplicated.**
`is_active: a.end_date === null` is computed in `students/[id]/assignments/route.ts:48`, `students/[id]/page.tsx:66`, and `student-profile-tabs.tsx:17`. Minor, but a sign that "active assignment" is a domain concept without a name. A `isActiveAssignment(a)` helper would centralize it.

**DRY-5. Date formatting `new Date(x).toLocaleDateString("ar-EG")` repeated ~15 times.**
A `formatArabicDate(iso)` in `lib/arabic.ts` would centralize locale + formatting.

**Verdict:** DRY is the principle most at risk. DRY-1 and DRY-2 are the highest-impact fixes. The rest are low-effort cleanups.

---

## 4. SOLID

### S — Single Responsibility ✅ Mostly good

- `progress.ts` does one thing (progress computation). `sessions.ts` does validation. `student-access.ts` does authorization. Clean.
- **Violation:** `students.ts` mixes level labels, count derivation, validation, AND `recalculateStudentSummary` (a DB mutation). Split: pure helpers → `domain/students.ts`; the recalc mutation → `features/students/server/recalc.ts`.
- **Violation:** `attendance.ts` mixes the pure calendar function with the impure `recalculateStudentAttendance` (delete-all + reinsert). Same split.

### O — Open/Closed ⚠️ Not applicable yet, but watch it

- The codebase is open/closed *by accident* in the right places: adding a new session type means touching `SESSION_TYPES` in `sessions.ts` + the DB CHECK + the badge component — three places, not great, but acceptable for a 3-value enum.
- The nav is data-driven (`getNavItems(role)`), which is correctly O/C — add a nav entry, not a code branch.
- **Risk:** the `students` list filter logic in `api/students/route.ts` is a long `if/else` chain. Adding a new filter means editing this chain. Not a problem at 8 filters; would be at 20.

### L — Liskov ✅ N/A (no inheritance hierarchies — composition throughout, which is correct)

### I — Interface Segregation ⚠️ Two issues

- `ApiAppUser` (review I5) forces every caller to carry `gender` + `can_view_all_genders` even when they only need `id` + `role`. Segregate into `AppUser` (identity) vs `TeacherScoping` (gender fields) — or just one type with optional fields.
- The Supabase client type `SupabaseClient` is used everywhere as a parameter, but callers only use `.from()` or `.auth()`. Not worth splitting, but note it.

### D — Dependency Inversion ✅ Good where it matters

- `computeJuzProgressPure` depends on plain arrays, not on `SupabaseClient`. The DB-fetching shell `computeJuzProgress` depends on the pure function, not vice versa. This is textbook DIP and it's the best part of the codebase.
- `validateSessionPayload` takes a plain object, not a Request. Correct.
- **Gap:** `recalculateStudentSummary` and `recalculateStudentAttendance` take a `SupabaseClient` directly — they can't be unit-tested without a DB. If you move them to `features/*/server/`, keep the *pure* parts (the math) in `domain/` and the *impure* parts (the queries) in the feature layer.

**Verdict:** SOLID is ~70% respected. The pure/impure split is excellent (S, D). The main gaps are `students.ts`/`attendance.ts` mixing pure + impure (S), and the `ApiAppUser` interface being too fat (I).

---

## 5. Design patterns observed

| Pattern | Where | Verdict |
| --- | --- | --- |
| **Pure core / shell** (functional core, imperative shell) | `computeJuzProgressPure` + `computeJuzProgress` | ✅ Excellent. Keep this as the template for all new domain logic. |
| **Factory** | `createSupabase*Client()` factories | ✅ Correct — encapsulates env + cookie config. |
| **Strategy** (implicit) | Color assignment in progress (green/blue/yellow/gray) | ⚠️ Inline `if/else`. Fine at 4 strategies; if rules grow, extract. |
| **Decorator** (implicit) | `withApiAuth` *should* be here but isn't | ❌ Missing — this is the DRY-1 fix. |
| **Adapter** | Cookie adapters in `server.ts` (readonly vs writable) | ✅ Clean. |
| **Data-Driven Config** | `getNavItems(role)`, `levelBgMap`, `sortMap` | ✅ Good — config over code. |
| **Repository** | Not present | ⚠️ Optional. Only add if query duplication (DRY-3) becomes painful. Don't add speculatively. |
| **Active Record / Service** | `recalculateStudentSummary` is a service on top of an active-record-ish Supabase client | ⚠️ Acceptable for Supabase, but the mutation lives in the wrong file (see S above). |

**No anti-patterns detected** (no god objects, no singletons, no anemic domain model in the pure functions, no leaky abstractions in the client factories). The `ApiAppUser`/`AppUser` split is the closest thing to an anti-pattern (duplicate model).

---

## 6. Reusability assessment

### Reusable today ✅

- `computeJuzProgressPure` — pure, typed, tested, no deps. Reusable anywhere.
- `validateSessionPayload` — pure, typed. Reusable.
- `getLevelInfo`, `countsFromInitialMemorization` — pure. Reusable.
- Supabase client factories — reusable across any route/component.
- `canAccessStudent`, `getAssignedStudentIds`, `getApiAppUser` — reusable across any route (and already used in 5+ routes).
- shadcn/ui primitives — reusable by design.

### Not reusable (coupled) ❌

- `recalculateStudentSummary` / `recalculateStudentAttendance` — coupled to `SupabaseClient`, can't be tested or reused without a DB.
- The API route handlers — each is a monolith; none of the auth/scoping logic is extracted into a reusable wrapper.
- The progress *route* (`students/[id]/progress/route.ts`) — duplicates domain logic instead of reusing it.
- Relational join mapping (the `as unknown as { id, name }` casts) — repeated, not extracted, and untyped.

### Reusability blockers

1. **No generated DB types.** Supabase can generate TypeScript types from your schema (`supabase gen types typescript`). Without them, every query result is `any`, every join cast is `as unknown as`, and drift like C1 (the `is_active` bug) is invisible to the compiler. **This is the single highest-leverage improvement for reusability and safety.**
2. **No shared API client on the frontend.** Each component calls `fetch()` directly with its own error handling (or lack of it — `student-sessions-tab.tsx` has no `res.ok` check; `student-ijazat-tab.tsx` does). A `lib/api-client.ts` with `apiGet`/`apiPost`/`apiDelete` wrappers would centralize error handling, typing, and auth.

---

## 7. Other issues / errors not in the main review

**E1. Inconsistent fetch error handling across client components.**

- `student-ijazat-tab.tsx:31-33` — checks `res.ok` and throws. ✅
- `student-sessions-tab.tsx:50-52` — does **not** check `res.ok`, just `setSessions(data)`. A 403/500 response sets the error body as the session list. ❌
- `student-attendance-tab.tsx:41-44` — same, no `res.ok` check. ❌
- `admin/teachers/new/page.tsx:56-57` — checks `res.ok`. ✅

This is the DRY-1 problem on the client side. A shared `apiFetch` wrapper fixes both consistency and error handling.

**E2. `student-ijazat-tab.tsx` uses `any` for caught errors.**
`catch (err: any)` then `err.message`. With `strict: true` this should be `catch (err) { const msg = err instanceof Error ? err.message : "..." }`. Same in `handleRevoke`. Minor, but `any` in catch defeats strict mode.

**E3. `progress/route.ts:181` uses `any[]`.**
`const juzSessionsList: any[] = []` — explicit `any` in the most type-sensitive route. Should be a typed `JuzSessionDetail[]`.

**E4. `ijazat/route.ts` GET doesn't apply gender scoping for teachers.**
`getAssignedStudentIds` filters by active assignment, but the ijazat list query then filters `in("student_id", assignedIds)` without re-checking gender. If `can_view_all_genders` is false and a student's gender changed after assignment, a teacher could see ijazat for a non-matching gender. `canAccessStudent` does the gender check; the list path doesn't. Compare with `sessions/route.ts:34-38` which also doesn't gender-filter the list. **This is a scoping inconsistency** — `canAccessStudent` (single-resource) checks gender, but the list endpoints don't. Decide: either filter lists by gender too, or document that assignment implies gender-trust.

**E5. `assignments/route.ts` GET fetches `allStudents` *and* `allAssignments` separately, ignoring the first `data` query.**
Lines 24-30 fetch students with active assignments (with `!inner`), then lines 33-36 fetch *all* students, then lines 39-42 fetch *all* assignments. The first query's result (`data`) is never used — only `error` is checked on line 44. The first query is dead work. Remove it.

**E6. No rate limiting / brute-force protection on login.**
`loginAction` calls `signInWithPassword` directly with no throttle. Supabase Auth has built-in rate limits, but there's no application-level lockout or captcha. For a real institution, consider Supabase's email rate limits + a failed-attempt counter.

**E7. `recalculateStudentAttendance` throws if `enrollment_date` is missing.**
`attendance.ts:42` — `throw new Error("Student enrollment_date is required")`. This is called from `POST /api/sessions` after a successful insert. If the student has no enrollment_date, the session is created but the attendance recalc throws, and the route returns 500 — leaving the session orphaned from attendance. Either make enrollment_date non-null (schema says `NOT NULL DEFAULT CURRENT_DATE`, so this should never happen — but the throw is a loud failure mode for an invariant the DB already enforces) or swallow it gracefully.

**E8. `students/[id]/route.ts` PUT for teachers only updates `notes`.**
Lines 115-125 — a teacher can only edit notes, nothing else. This is a deliberate scoping decision (good), but it's silent: the teacher's edit form may show fields that will be ignored on submit. Make sure the teacher edit UI only shows the notes field.

---

## 8. Recommendations (do in this order)

### Tier 0 — Stabilize (before any refactor or new feature)

1. **Fix C1** (the `is_active` selects). 5 minutes.
2. **Fix C2** (attendance respects `status`). Real data corruption.
3. **Generate Supabase DB types** (`supabase gen types typescript --lang=typescript > src/types/db.ts`). This single change makes C1 impossible to reintroduce, removes every `as unknown as` cast, and types every query result. Highest leverage.
4. **Add Vitest + a `npm test` script.** Move `progress.test.ts` and `attendance.test.ts` under `vitest`. Add a GitHub Action that runs `npm run build` + `npm test` on push (fixes C5 + I6).
5. **Harden `validateInitialMemorization` + students POST/PUT** (I1, I2) to match `validateSessionPayload`.

### Tier 1 — Reduce duplication (DRY)

1. **Extract `withApiAuth(handler)` / `getApiContext()`** to kill the ~120 lines of auth boilerplate (DRY-1). Every route becomes 2 lines of setup.
2. **Extract `computeJuzProgressDetailedPure()`** in `domain/progress.ts` and have the progress route call it instead of duplicating the algorithm (DRY-2).
3. **Add `lib/api-client.ts`** with `apiGet/apiPost/apiDelete` for the frontend — centralizes `res.ok` checks, error messages, and typing (fixes E1).
4. Small DRY wins: `formatArabicDate()`, `isActiveAssignment()`, `pickTeacherName()`.

### Tier 2 — Reorganize (only after Tier 0+1)

1. **Move pure logic to `src/domain/`** (progress, attendance calendar, validation, level/count helpers). Keep them Supabase-free.
2. **Move impure mutations to `src/features/<feature>/server/`** (`recalculateStudentSummary`, `recalculateStudentAttendance`).
3. **Group components by feature** (`src/features/students/components/`). Don't do this all at once — do it feature-by-feature as you touch them.
4. **Consolidate `AppUser`/`ApiAppUser`** into one type (or use the generated DB type).

### Tier 3 — Domain enrichment (roadmap, when ready)

1. Halaqa entity (group sessions + scheduling).
2. Manual attendance with excused/holiday statuses (fixes C4).
3. Student status workflow (active → paused → graduated/withdrawn) with date ranges, so attendance can skip paused periods (fixes C2 properly).
4. Revision schedule, exam tracking, parent portal, PDF certificates.

---

## 9. Bottom line

**Keep it simple.** The codebase's biggest strength is its restraint — no premature abstractions, no framework-of-the-week, pure functions where it counts. Don't trade that for DDD ceremony you don't need.

**The real risk isn't architecture — it's duplication and missing safety nets.** The `is_active` bug (C1) shipped because there's no generated DB types and no CI. The progress route duplicates the engine because there's no shared "detailed" variant. The auth boilerplate is copy-pasted because there's no `withApiAuth`. These are DRY and tooling problems, not architecture problems.

**Adopt the "pragmatic feature-sliced" structure gradually** — `domain/` for pure rules, `features/` for vertical slices, `infrastructure/` for Supabase. But do it *after* Tier 0, one feature at a time, never as a big-bang refactor. The pure functions you already have (`computeJuzProgressPure`, `validateSessionPayload`) are the seed of the `domain/` layer — you're 30% of the way there already.
