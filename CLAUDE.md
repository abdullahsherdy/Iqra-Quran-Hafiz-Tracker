# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**اقرأ (Iqra)** — a Quran memorization (تحفيظ) tracking app for a halaqa. The entire UI is **Arabic and RTL**; user-facing strings are Arabic literals in the source. Domain vocabulary: *juz* (جزء, 1–30), *ijaza* (إجازة, a formal certification of memorization), *halaqa* (حلقة, study circle), *hafiz* (memorizer).

## Commands

```bash
npm run dev        # start dev server on :3000
npm run build      # production build (also the primary typecheck — CI-equivalent)
npm run lint       # eslint (flat config, next core-web-vitals + typescript)
npm start          # serve production build
npm test           # vitest run (unit tests across progress, attendance, students, sessions, review)
npm run test:watch # vitest in watch mode

# Drizzle ORM (schema + migrations)
npm run db:generate  # generate a new SQL migration from schema.ts changes
npm run db:push      # push schema changes directly to the live DB (dev only)
npm run db:studio    # open Drizzle Studio (GUI for browsing DB data)

# CLI scripts (run via tsx)
npx tsx src/features/students/server/backfill.ts  # recompute every student's cached summary (hits live DB)
```

Scripts that import server-only modules but run under Node/tsx (e.g. `backfill.ts`) manually stub the `server-only` package at the top of the file — mirror that pattern for any new CLI script that reaches into server-only modules.

## Critical: Next.js 16

This is **Next.js 16**, which has breaking changes from earlier versions. Per `AGENTS.md`, consult `node_modules/next/dist/docs/` before writing framework code rather than relying on prior Next.js knowledge. Two gotchas already in the codebase:

- **Middleware is renamed to "proxy".** The edge entry point is `src/proxy.ts` (exports `proxy()` + `config.matcher`), not `middleware.ts`.
- `cookies()` and route `params` are **async** (`await`ed everywhere).

## Architecture

Next.js App Router + Supabase (Postgres, Auth, RLS) + Drizzle ORM. Path alias `@/*` → `src/*`.

### Feature-sliced architecture

```
src/
├── app/                      # Next.js routing shell (thin pages + API routes)
├── components/               # shared components (badges, app-shell, login-form, ui/)
├── db/                       # Drizzle ORM (schema.ts, client.ts, rls.sql)
├── domain/                   # PURE business rules — no I/O, no Drizzle, no Supabase
│   ├── progress.ts           # computeJuzProgressPure, computeJuzProgressDetailedPure
│   ├── attendance.ts         # computeAttendanceCalendar, computeDayAttendance
│   ├── sessions.ts           # validateSessionPayload (multi-item sessions)
│   ├── review.ts             # computeReviewSchedule (spaced repetition: 1/7/30-day rules)
│   ├── students.ts           # getLevelInfo, validateStudentPayload, validateInitialMemorization
│   └── types.ts              # shared enum types (Rating, SessionType, Gender, etc.)
├── features/                 # vertical slices (components + server shells per feature)
│   ├── students/{components,server}/
│   ├── sessions/components/
│   ├── attendance/{components,server}/
│   ├── ijazat/components/
│   └── auth/                 # actions.ts, session.ts, shared.ts, student-access.ts
├── infrastructure/auth/      # Supabase auth adapters (server, admin, proxy, config)
├── lib/                      # shared utilities (api-client, api-error, arabic, nav, utils)
└── proxy.ts                  # edge guard → infrastructure/auth/proxy
```

- **`domain/`** — pure functions, no I/O deps. Unit-tested. Never import Drizzle/Supabase/Next here.
- **`features/*/server/`** — DB-fetching shells that call pure domain functions with a `Db` client.
- **`features/*/components/`** — feature-specific React components.
- **`features/auth/`** — auth session guards, server actions, student-access helpers.
- **`infrastructure/auth/`** — Supabase JS SDK wrappers (auth only, not data queries).
- **`lib/`** — cross-cutting utilities shared across features (`api-client`, `api-error`, `arabic`, `nav`, `utils`).
- **`components/`** — shared UI (`badges`, `app-shell`, `login-form`, shadcn `ui/`).

### Database access — two layers

1. **Drizzle ORM** (`src/db/`) — the primary data access layer for all server-side queries (API routes, RSC pages, server actions, feature server shells).
   - `src/db/schema.ts` — single source of truth for the DB schema. JS property names are **snake_case** to match DB column names and the existing codebase convention.
   - `src/db/client.ts` — `getDb()` returns a Drizzle client (`Db | null`) using the `pg` driver + `DATABASE_URL` env var. Server-only (uses `pg` Node driver, cannot run at the edge).
   - Migrations in `drizzle/migrations/` generated via `npm run db:generate`.
   - **Bypasses RLS** (uses a direct Postgres connection, not Supabase JWTs). App-level authorization is enforced in code (see below).

2. **Supabase JS SDK** (`src/infrastructure/auth/`) — used ONLY for:
   - **Auth**: `supabase.auth.getUser()`, `signInWithPassword()`, `signOut()`, `admin.auth.admin.createUser()`.
   - **Edge proxy** (`src/proxy.ts`): the `pg` driver cannot run at the edge, so the proxy uses the Supabase JS SDK for the `users` table lookup during request routing.
   - `server.ts` — `createSupabaseServerComponentClient()` (readonly cookies, for `auth.getUser()` in RSC) and `createSupabaseServerActionClient()` (writable cookies, for Server Actions like login/logout).
   - `admin.ts` — `createSupabaseAdminClient()` uses the service-role key. Only used for `admin.auth.admin.createUser()` in the teachers API route (Supabase Auth user creation). All data queries use Drizzle.

### Auth & roles

Two roles only: `admin` and `teacher` (`AppRole` in `src/domain/types.ts`, re-exported from `src/features/auth/shared.ts`). There is no separate "student" login — students are data records, not users.

- **Login is username+password**, but Supabase Auth needs an email, so usernames are mapped to synthetic emails via `usernameToEmail()` (`<username>@<AUTH_EMAIL_DOMAIN>`). See `src/features/auth/actions.ts`.
- A Supabase auth user is joined to the app's `public.users` row **by shared `id`**. `getCurrentAppUser()` / `requireRole()` (`src/features/auth/session.ts`) are the server-component guards; call `requireRole("admin" | "teacher")` at the top of protected pages — it redirects on failure. These use Supabase SDK for `auth.getUser()` and Drizzle for the `users` table lookup.
- `src/proxy.ts` → `updateSupabaseSession()` is the edge guard: refreshes the session cookie and enforces role-based access to `/admin/*` and `/teacher/*`, redirecting to each role's home (`roleHomePath`). Uses Supabase JS SDK (edge runtime, no `pg`).

### Authorization pattern in API routes (`src/app/api/**`)

The established pattern (see `src/app/api/students/route.ts`) is:

1. Get the caller from the **server component Supabase client** (`auth.getUser()`) → 401 if absent.
2. Get the Drizzle client: `const db = getDb()` → 500 if null.
3. Look up the app user via `getApiAppUser(db, user.id)` → 403 if not found or inactive.
4. **Enforce scoping in code, not via RLS**, because the Drizzle client bypasses RLS. The rules:
   - A `teacher` sees all students matching their own `gender` (or all students if `can_view_all_genders = true`). The assignment system (`teacher_student_assignments`) has been removed — access is gender-only.
   - Gender scoping: a teacher with `can_view_all_genders = false` sees only students matching their own `gender`.
   - `admin` sees everything.
5. Shared authorization helpers live in `src/features/auth/student-access.ts` (`getApiAppUser`, `canAccessStudent`). All take `Db` as the first argument. Prefer these over re-implementing the checks inline. `canAccessStudent` checks gender only (admin → true; teacher → true if gender matches or `can_view_all_genders`).
6. Shared API context helper: `getApiContext()` in `src/features/auth/api-context.ts` returns `{ ok: true, db, appUser }` or `{ ok: false, response }` — eliminates auth boilerplate. All API routes use it.

### Teacher attribution

Teacher-student relationships are tracked **per-session** via `sessions.teacher_id` (NOT NULL, FK to `users`). The `teacher_student_assignments` table has been dropped (migration 0004). When a teacher records a session, their `user.id` is automatically stored as `teacher_id`. Admin pages that show "which teachers work with this student" derive the list from distinct `sessions.teacher_id` values.

### Role permissions matrix

Both `admin` and `teacher` roles share most capabilities. Teachers are gender-scoped (see Authorization pattern above) but otherwise have the same data access. The only admin-only operations are:

| Capability | Admin | Teacher | Notes |
|---|---|---|---|
| View students | ✅ all | ✅ gender-scoped | Teacher sees own gender (or all if `can_view_all_genders`) |
| Create students | ✅ | ✅ gender-scoped | Teacher can only create students matching their gender (unless `can_view_all_genders`) |
| Edit student personal info | ✅ | ✅ | name, gender, birth date, guardian name/phone, enrollment date, notes |
| Edit student status | ✅ | ✅ | active / paused / graduated / withdrawn — stamps `status_since` |
| Edit initial memorization (hefz) | ✅ | ✅ | `initial_memorization` grid — triggers `recalculateStudentSummary` |
| Delete students | ✅ | ❌ | Soft delete (→ withdrawn) or permanent hard delete with cascade |
| Record sessions | ✅ | ✅ | Teacher auto-attributed as `teacher_id`; admin can specify `teacher_id` |
| Edit/delete sessions | ✅ all | ✅ own only | Teacher can only modify sessions they recorded |
| View attendance | ✅ | ✅ | Auto-derived from sessions (present days only); shown as stats cards in sessions tab |
| Grant ijazat | ✅ | ✅ | `granted_by` = caller's `user.id` |
| View ijazat | ✅ all | ✅ gender-scoped | Same gender scoping as students |
| Revoke ijazat | ✅ | ❌ | DELETE `/api/ijazat/[id]` — admin only |
| Manage teachers | ✅ | ❌ | Create/list/update teacher accounts (is_active, can_view_all_genders) |
| View reports | ✅ | ✅ scoped | Admin sees all; teacher sees own students/sessions |

The shared edit form (`EditStudentForm`) renders the same UI for both roles — the `mode` prop exists for interface compatibility but no longer gates any fields. The PUT `/api/students/[id]` route applies the same allowed-fields list, validation, and summary recalculation to both roles.

### Progress computation (the core domain logic)

`src/domain/progress.ts` is the heart of the app — a **pure function** (`computeJuzProgressPure`) with no I/O deps. The DB-fetching shell (`computeJuzProgress`) lives in `src/features/students/server/progress.ts`. Keep the pure/impure split — the pure function is what the unit tests exercise, and it takes an injectable `referenceDate` for deterministic date-based tests. The DB-fetching shell takes a `Db` client (Drizzle).

For each of the 30 juz it computes ayah-level coverage by intersecting recorded session items (ayah ranges from `session_items` joined to `sessions`) against `juz_boundaries`, unioning overlapping ranges per surah, then assigns a color:
- **green** = has ijaza · **blue** = ≥70% covered, not weak-dominant, active within 30 days · **yellow** = covered but stale/weak · **gray** = untouched.
- `initial_memorization` rows count as fully-covered juz; `with_ijaza` status and formal `ijazat` (type `juz` or `full_quran`) confer ijaza/green.
- An init mem row with a non-null `pages` value represents **partial** memorization — coverage is computed from exact page-to-ayah ranges in the `juz_pages` table (not the old N/20 proportional estimate). Overall coverage = max(session coverage, init-mem page coverage). `pages` does **not** affect `memorized_juz_count` — each init mem row still counts as 1 juz.

`students.memorized_juz_count`, `ijaza_juz_count`, and `last_session_date` are **denormalized caches**. After any mutation that affects progress (new session, ijaza, initial-memorization edit), call `recalculateStudentSummary()` (`src/features/students/server/recalc.ts`) to recompute them. `backfill.ts` reruns this across all students. Both take a `Db` client.

### Routing structure

Route groups: `(auth)/login`, `(admin)/admin/*`, `(teacher)/teacher/*`, plus `app/api/*`. Sidebar/nav is data-driven from `src/lib/nav.ts` (`getNavItems(role)`) — add a nav entry there, not in a layout. Admin and teacher have parallel feature sets (students, sessions, ijazat, reports) with different scoping. There is no longer a separate attendance page or assignments page — attendance is auto-derived from sessions (shown as stats cards in the sessions tab), and teacher-student relationships are implicit via session records.

### Database schema & migrations

- **Schema source of truth**: `src/db/schema.ts` (Drizzle). JS property names are snake_case to match DB columns.
- **Migrations**: `drizzle/migrations/` — generated via `npm run db:generate`. Apply to the live DB via Supabase SQL editor or `npm run db:push`.
- **RLS policies**: `supabase/legacy/rls.sql` — applied manually once (Drizzle does not manage RLS). Stale (references dropped `teacher_student_assignments` table); needs updating if RLS is required.
- **Seed data**: `supabase/legacy/seed.sql` — 114 surahs + 30 juz boundaries. Apply once on a fresh database.
- **Legacy schema**: `supabase/legacy/schema.sql` — the original full schema, superseded by Drizzle. See `supabase/legacy/README.md`.
- Key tables: `users`, `students`, `sessions`, `session_items`, `attendance`, `ijazat`, `initial_memorization`, `surahs`, `juz_boundaries`, `juz_pages`. The `teacher_student_assignments` table has been dropped (migration 0004) — assignments were removed in favor of gender-only scoping + session-level teacher attribution via `sessions.teacher_id`.
- **`session_items`** (migration 0005): each session contains one or more items representing a Quran portion (surah + ayah range) that was recited. An item has `session_type` (`new_memorization` or `review`), `surah_id`, `from_ayah`, `to_ayah`, `rating`, optional `pages` and `notes`. The parent `sessions` table holds `overall_rating`, `notes`, `session_date`, `student_id`, `teacher_id`. This allows a single session to include both new memorization and review portions. Session items cascade-delete with their parent session (`ON DELETE CASCADE`).
- **Session form** (`session-form.tsx`): in create mode, the form starts with zero items — the teacher clicks "إضافة عنصر" to add each item. New items are empty (surah picker has a placeholder option, ayah fields blank). All items can be removed (no minimum). The session date picker has `max={today}` to prevent future dates. `validateSessionPayload` enforces this server-side via an optional `todayDate` parameter (both POST and PUT routes pass `todayDateString()`). In edit mode, the form initializes from the existing session's items.
- **Spaced repetition review** (`src/domain/review.ts`): pure function `computeReviewSchedule` computes which new-memorization items should be reviewed on a target date using three look-back rules: 1-day, 7-day, and 30-day. Only `new_memorization` items trigger scheduled reviews. The API endpoint `GET /api/students/[id]/review?date=YYYY-MM-DD` returns the schedule grouped by rule. The student profile has a "المراجعة المجدولة" tab showing the review calendar. The new-session form (`session-form.tsx`) also shows the recommended review inline via the `RecommendedReview` component (create mode only), so the teacher can see what the student should review while recording the session.
- **Attendance** (auto-derived, present-only): attendance is auto-derived from sessions — a row is created for each day a student has a session. There is no absence tracking, no manual entry, and no excused/holiday statuses. `computeAttendanceCalendar` (pure, `src/domain/attendance.ts`) returns only present days; `recalculateStudentAttendance` (`src/features/attendance/server/recalc.ts`) persists them. The API endpoint `GET /api/students/[id]/attendance` returns `{ records, stats: { total, thisMonth } }` (no POST/DELETE). Attendance stats (total + this month) are shown as two cards at the top of the sessions tab in the student profile.
- **`juz_pages`** maps each page within each juz to exact surah + ayah range(s) (665 rows; some pages span multiple surahs → one row per surah). Seeded from `juz_pages.json` via `scripts/seed-juz-pages.js`. Used by progress computation for partial init-mem coverage. Juz page counts vary (most 20, some 21, Juz 30 has 23) — hence `initial_memorization.pages` CHECK is 1-23.
- **`initial_memorization.pages`** (smallint, nullable, CHECK 1-23): when set, the row represents partial memorization of that juz (N pages memorized, not the full juz). When null/absent, the row = full juz memorized.

### Connection: Supavisor pooler (IPv4)

The Supabase direct DB host (`db.*.supabase.co`) is IPv6-only and often unreachable. Use the **Supavisor pooler** URL (IPv4, port 6543) from Supabase Dashboard → Connect → Transaction pooler. Set `DATABASE_URL` in `.env.local`:

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

## Conventions

- **UI text is Arabic**; keep new user-facing strings Arabic and RTL-aware.
- shadcn/ui (new-york style) base components live in `src/components/ui/`; add more with `npx shadcn@latest add <component>`. Icons are `lucide-react`. Merge classes with `cn()` from `@/lib/utils`.
- Domain enums are string literals matched by DB `CHECK` constraints — keep TS unions and SQL constraints in sync (`session_type`, `rating`, `ijaza_type`, `status`, `role`, `gender`).
- **Data queries use Drizzle** (`getDb()` + `db.select().from(table)`). **Auth queries use Supabase SDK** (`supabase.auth.*`). Never use the Supabase JS SDK `.from()` for data queries — use Drizzle instead.
- **Error handling**: Drizzle throws on error (no `error` field in response). Use `sanitizeError()` from `@/lib/api-error` in catch blocks for API responses. Never return raw `error.message` to the client.
- **Client-side data fetching**: use `apiGet`/`apiPost`/`apiPut`/`apiDelete` from `@/lib/api-client` (handles JSON parsing, error normalization via `ApiError`).
- **Phone validation**: guardian phones must match the Egyptian format `^01[0125]\d{8}$` (11 digits, prefixes 010/011/012/015). Enforced server-side in `validateStudentPayload` and client-side in the new/edit student forms.
- **Timezone**: `todayDateString()` in `@/lib/utils` uses `Africa/Cairo` for date determination (attendance "today" rolls over at midnight Cairo time, not UTC).
- `docs/plans/00-overview.md` and the numbered plan files describe the intended build sequence; `docs/Quran-hafiz-tracker-design.md` is the full spec that section references (e.g. "§6.1.1") point to.
- **Responsive tables**: list tables use a dual-render pattern — a `<table>` for `sm+` screens and a card-based layout for mobile (`<640px`). See `admin-ijazat-table.tsx` for the established pattern (`hidden sm:block` table + `sm:hidden` cards). The admin ijazat page uses a vertical stack (form on top, log below) rather than a side-by-side grid.

## Testing

Vitest is configured (`vitest.config.ts`). Tests are co-located with source files as `*.test.ts` in `src/domain/`. Run with `npm test`. The pure domain functions (`computeJuzProgressPure`, `computeJuzProgressDetailedPure`, `computeAttendanceCalendar`, `computeDayAttendance`, `validateSessionPayload`, `validateStudentPayload`, `validateInitialMemorization`, `getLevelInfo`, `countsFromInitialMemorization`, `computeReviewSchedule`, `groupReviewsByRule`) are unit-tested; the DB-fetching shells are not (they require a live DB).
