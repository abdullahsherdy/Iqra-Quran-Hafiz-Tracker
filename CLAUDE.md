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
npm test           # vitest run (75 unit tests across progress, attendance, students, sessions)
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
│   ├── sessions.ts           # validateSessionPayload
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
   - `src/db/rls.sql` — RLS policies (applied manually once; Drizzle does not manage RLS).
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
   - A `teacher` sees only students actively assigned to them (`teacher_student_assignments` where `end_date IS NULL`).
   - Gender scoping: a teacher with `can_view_all_genders = false` sees only students matching their own `gender`.
   - `admin` sees everything.
5. Shared authorization helpers live in `src/features/auth/student-access.ts` (`getApiAppUser`, `getAssignedStudentIds`, `canAccessStudent`). All take `Db` as the first argument. Prefer these over re-implementing the checks inline.
6. Shared API context helper: `getApiContext()` in `src/features/auth/api-context.ts` returns `{ ok: true, db, appUser }` or `{ ok: false, response }` — eliminates auth boilerplate. All API routes use it.

### Progress computation (the core domain logic)

`src/domain/progress.ts` is the heart of the app — a **pure function** (`computeJuzProgressPure`) with no I/O deps. The DB-fetching shell (`computeJuzProgress`) lives in `src/features/students/server/progress.ts`. Keep the pure/impure split — the pure function is what the unit tests exercise, and it takes an injectable `referenceDate` for deterministic date-based tests. The DB-fetching shell takes a `Db` client (Drizzle).

For each of the 30 juz it computes ayah-level coverage by intersecting recorded `sessions` (ayah ranges) against `juz_boundaries`, unioning overlapping ranges per surah, then assigns a color:
- **green** = has ijaza · **blue** = ≥70% covered, not weak-dominant, active within 30 days · **yellow** = covered but stale/weak · **gray** = untouched.
- `initial_memorization` rows count as fully-covered juz; `with_ijaza` status and formal `ijazat` (type `juz` or `full_quran`) confer ijaza/green.

`students.memorized_juz_count`, `ijaza_juz_count`, and `last_session_date` are **denormalized caches**. After any mutation that affects progress (new session, ijaza, initial-memorization edit), call `recalculateStudentSummary()` (`src/features/students/server/recalc.ts`) to recompute them. `backfill.ts` reruns this across all students. Both take a `Db` client.

### Routing structure

Route groups: `(auth)/login`, `(admin)/admin/*`, `(teacher)/teacher/*`, plus `app/api/*`. Sidebar/nav is data-driven from `src/lib/nav.ts` (`getNavItems(role)`) — add a nav entry there, not in a layout. Admin and teacher have parallel feature sets (students, sessions, ijazat, attendance, reports) with different scoping.

### Database schema & migrations

- **Schema source of truth**: `src/db/schema.ts` (Drizzle). JS property names are snake_case to match DB columns.
- **Migrations**: `drizzle/migrations/` — generated via `npm run db:generate`. Apply to the live DB via Supabase SQL editor or `npm run db:push`.
- **RLS policies**: `src/db/rls.sql` — applied manually once (Drizzle does not manage RLS). A copy is also in `supabase/legacy/rls.sql`.
- **Seed data**: `supabase/legacy/seed.sql` — 114 surahs + 30 juz boundaries. Apply once on a fresh database.
- **Legacy schema**: `supabase/legacy/schema.sql` — the original full schema, superseded by Drizzle. See `supabase/legacy/README.md`.
- Key tables: `users`, `students`, `teacher_student_assignments`, `sessions`, `attendance`, `ijazat`, `initial_memorization`, `surahs`, `juz_boundaries`.

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
- `docs/plans/00-overview.md` and the numbered plan files describe the intended build sequence; `docs/Quran-hafiz-tracker-design.md` is the full spec that section references (e.g. "§6.1.1") point to.

## Testing

Vitest is configured (`vitest.config.ts`). Tests are co-located with source files as `*.test.ts` in `src/domain/`. Run with `npm test`. The pure domain functions (`computeJuzProgressPure`, `computeJuzProgressDetailedPure`, `computeAttendanceCalendar`, `computeDayAttendance`, `validateSessionPayload`, `validateStudentPayload`, `validateInitialMemorization`, `getLevelInfo`, `countsFromInitialMemorization`) are unit-tested; the DB-fetching shells are not (they require a live DB).
