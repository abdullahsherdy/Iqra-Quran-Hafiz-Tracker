# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**أقرأ (Iqra)** — a Quran memorization (تحفيظ) tracking app for a halaqa. The entire UI is **Arabic and RTL**; user-facing strings are Arabic literals in the source. Domain vocabulary: *juz* (جزء, 1–30), *ijaza* (إجازة, a formal certification of memorization), *halaqa* (حلقة, study circle), *hafiz* (memorizer).

## Commands

```bash
npm run dev      # start dev server on :3000
npm run build    # production build (also the primary typecheck — CI-equivalent)
npm run lint     # eslint (flat config, next core-web-vitals + typescript)
npm start        # serve production build
```

There is **no test runner configured**. Tests are standalone TS scripts run directly:

```bash
npx tsx src/lib/progress.test.ts   # pure unit tests for juz-progress logic
npx tsx src/lib/backfill.ts        # recompute every student's cached summary (hits live DB)
```

Scripts that import server-only modules but run under Node/tsx (e.g. `backfill.ts`) manually stub the `server-only` package at the top of the file — mirror that pattern for any new CLI script that reaches into `src/lib`.

## Critical: Next.js 16

This is **Next.js 16**, which has breaking changes from earlier versions. Per `AGENTS.md`, consult `node_modules/next/dist/docs/` before writing framework code rather than relying on prior Next.js knowledge. Two gotchas already in the codebase:

- **Middleware is renamed to "proxy".** The edge entry point is `src/proxy.ts` (exports `proxy()` + `config.matcher`), not `middleware.ts`.
- `cookies()` and route `params` are **async** (`await`ed everywhere).

## Architecture

Next.js App Router + Supabase (Postgres, Auth, RLS). Path alias `@/*` → `src/*`.

### Auth & roles

Two roles only: `admin` and `teacher` (`AppRole` in `src/lib/auth/shared.ts`). There is no separate "student" login — students are data records, not users.

- **Login is username+password**, but Supabase Auth needs an email, so usernames are mapped to synthetic emails via `usernameToEmail()` (`<username>@<AUTH_EMAIL_DOMAIN>`). See `src/lib/auth/actions.ts`.
- A Supabase auth user is joined to the app's `public.users` row **by shared `id`**. `getCurrentAppUser()` / `requireRole()` (`src/lib/auth/session.ts`) are the server-component guards; call `requireRole("admin" | "teacher")` at the top of protected pages — it redirects on failure.
- `src/proxy.ts` → `updateSupabaseSession()` is the edge guard: refreshes the session cookie and enforces role-based access to `/admin/*` and `/teacher/*`, redirecting to each role's home (`roleHomePath`).

### Supabase clients — pick the right one (`src/lib/supabase/`)

Four distinct clients; using the wrong one is the most common mistake:

- `server.ts` — `createSupabaseServerComponentClient()` (readonly cookies, for RSC) and `createSupabaseServerActionClient()` (writable cookies, for Server Actions / route handlers that set cookies). Runs **as the logged-in user** → subject to RLS.
- `browser.ts` — `createSupabaseBrowserClient()` for client components.
- `admin.ts` — `createSupabaseAdminClient()` uses the **service-role key and bypasses RLS**. Server-only. API routes use this to enforce authorization *in application code* (see below).
- All client factories return `null` when env vars are missing; every caller must null-check and return a 500/config error.

### Authorization pattern in API routes (`src/app/api/**`)

The established pattern (see `src/app/api/students/route.ts`) is:

1. Get the caller from the **server component client** (`auth.getUser()`) → 401 if absent.
2. Switch to the **admin client** to read `public.users` and do all data work.
3. **Enforce scoping in code, not via RLS**, because the admin client bypasses RLS. The rules:
   - A `teacher` sees only students actively assigned to them (`teacher_student_assignments` where `end_date IS NULL`).
   - Gender scoping: a teacher with `can_view_all_genders = false` sees only students matching their own `gender`.
   - `admin` sees everything.
4. Shared authorization helpers live in `src/lib/auth/student-access.ts` (`getApiAppUser`, `getAssignedStudentIds`, `canAccessStudent`). Prefer these over re-implementing the checks inline.

### Progress computation (the core domain logic)

`src/lib/progress.ts` is the heart of the app and is written as a **pure function** (`computeJuzProgressPure`) wrapped by a DB-fetching shell (`computeJuzProgress`). Keep the pure/impure split — the pure function is what the unit tests exercise, and it takes an injectable `referenceDate` for deterministic date-based tests.

For each of the 30 juz it computes ayah-level coverage by intersecting recorded `sessions` (ayah ranges) against `juz_boundaries`, unioning overlapping ranges per surah, then assigns a color:
- **green** = has ijaza · **blue** = ≥70% covered, not weak-dominant, active within 30 days · **yellow** = covered but stale/weak · **gray** = untouched.
- `initial_memorization` rows count as fully-covered juz; `with_ijaza` status and formal `ijazat` (type `juz` or `full_quran`) confer ijaza/green.

`students.memorized_juz_count`, `ijaza_juz_count`, and `last_session_date` are **denormalized caches**. After any mutation that affects progress (new session, ijaza, initial-memorization edit), call `recalculateStudentSummary()` (`src/lib/students.ts`) to recompute them. `backfill.ts` reruns this across all students.

### Routing structure

Route groups: `(auth)/login`, `(admin)/admin/*`, `(teacher)/teacher/*`, plus `app/api/*`. Sidebar/nav is data-driven from `src/lib/nav.ts` (`getNavItems(role)`) — add a nav entry there, not in a layout. Admin and teacher have parallel feature sets (students, sessions, ijazat, attendance, reports) with different scoping.

### Database

Schema, RLS policies, and seed data are SQL files in `supabase/` (`schema.sql`, `rls.sql`, `seed.sql`) applied manually to the Supabase project — there are no migration tooling files. `seed.sql` contains the fixed reference data: 114 surahs and the 30 juz boundaries (`juz_boundaries`), which the progress engine depends on. Key tables: `users`, `students`, `teacher_student_assignments`, `sessions`, `attendance`, `ijazat`, `initial_memorization`, `surahs`, `juz_boundaries`.

## Conventions

- **UI text is Arabic**; keep new user-facing strings Arabic and RTL-aware.
- shadcn/ui (new-york style) base components live in `src/components/ui/`; add more with `npx shadcn@latest add <component>`. Icons are `lucide-react`. Merge classes with `cn()` from `@/lib/utils`.
- Domain enums are string literals matched by DB `CHECK` constraints — keep TS unions and SQL constraints in sync (`session_type`, `rating`, `ijaza_type`, `status`, `role`, `gender`).
- `docs/plans/00-overview.md` and the numbered plan files describe the intended build sequence; `docs/Quran-hafiz-tracker-design.md` is the full spec that section references (e.g. "§6.1.1") point to.
