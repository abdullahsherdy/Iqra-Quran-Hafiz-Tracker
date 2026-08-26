# Iqra (اقرأ) — Architecture & Project Documentation

**Date:** 2026-08-27
**Audience:** engineers new to the codebase, and the maintainer re-onboarding after time away.
**Status:** reflects the live `main` branch as read first-hand on 2026-08-27. Where this document and inline code disagree, the code wins — flag the drift.

---

## 1. What this app is

**Iqra (اقرأ)** is a Quran-memorization (تحفيظ) tracker for a single halaqa (study circle). Teachers record recitation sessions; the app computes each student's memorization progress across the 30 *juz*, schedules spaced-repetition reviews, tracks attendance (auto-derived), and issues *ijazat* (formal memorization certifications). Admins manage teachers and students; a super-admin manages admins and reads audit logs.

- **Language & direction:** the entire UI is **Arabic and RTL**. User-facing strings are Arabic literals in source.
- **Users are staff only:** roles are `super_admin`, `admin`, `teacher`. **Students are data records, not login accounts.**
- **Domain vocabulary:** *juz* (جزء, 1–30), *ijaza* (إجازة, certification), *halaqa* (حلقة, circle), *hafiz* (memorizer, حافظ).

---

## 2. Technology stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 16** (App Router) | Middleware renamed **"proxy"** (`src/proxy.ts`); `cookies()` and route `params` are **async**. Consult `node_modules/next/dist/docs/` before writing framework code. |
| UI | React 19, shadcn/ui (new-york), Tailwind, `lucide-react` | Merge classes with `cn()` from `@/lib/utils`. |
| Auth | Supabase Auth (`@supabase/ssr`, `@supabase/supabase-js`) | Username→synthetic-email mapping; JWT in cookies. |
| Data access | **Drizzle ORM** (`drizzle-orm`, `pg` driver) | Direct Postgres via `DATABASE_URL`. Bypasses RLS. |
| Database | Supabase Postgres | Connected via the Supavisor **pooler** (IPv4, port 6543). |
| PDF reports | `puppeteer` (headless Chromium) + HTML template | `/api/reports/parent-report`. |
| Testing | Vitest | Unit tests co-located as `*.test.ts` in `src/domain/`. |
| Path alias | `@/*` → `src/*` | |

### Commands
```bash
npm run dev          # dev server on :3000
npm run build        # production build — also the primary typecheck (CI-equivalent)
npm run lint         # eslint (flat config: next core-web-vitals + typescript)
npm start            # serve production build
npm test             # vitest run
npm run test:watch   # vitest watch

npm run db:generate  # generate SQL migration from schema.ts changes
npm run db:push      # push schema directly to live DB (dev only)
npm run db:studio    # Drizzle Studio GUI

npx tsx src/features/students/server/backfill.ts  # recompute every student's cached summary
```
CLI scripts that import server-only modules under tsx stub the `server-only` package at the top of the file — mirror that pattern for new scripts.

---

## 3. Architecture — feature-sliced clean architecture

```
src/
├── app/                      # Next.js routing shell (thin pages + API routes)
│   ├── (auth)/login/
│   ├── (admin)/admin/*       # admin + super_admin pages
│   ├── (teacher)/teacher/*   # teacher pages
│   └── api/**                # route handlers (the real backend)
├── components/               # shared UI (badges, app-shell, login-form, ui/)
├── db/                       # Drizzle: schema.ts (source of truth), client.ts
├── domain/                   # PURE business rules — no I/O, unit-tested
│   ├── progress.ts           # computeJuzProgressPure / ...DetailedPure  ← the core engine
│   ├── attendance.ts         # computeAttendanceCalendar / computeDayAttendance
│   ├── sessions.ts           # validateSessionPayload
│   ├── review.ts             # computeReviewSchedule (1/7/30-day spaced repetition)
│   ├── students.ts           # getLevelInfo, validateStudentPayload, validateInitialMemorization
│   ├── report-stats.ts       # report period types & aggregation helpers
│   └── types.ts              # shared enum unions (Rating, SessionType, Gender, ...)
├── features/                 # vertical slices: components + server shells per feature
│   ├── students/{components,server}/   # server/: progress.ts, recalc.ts, backfill.ts
│   ├── sessions/components/
│   ├── attendance/{components,server}/ # server/recalc.ts
│   ├── ijazat/components/
│   ├── reports/server/                 # generate-parent-report, parent-report-html
│   ├── audit/audit-log.ts              # logAction()
│   └── auth/                            # api-context, session, student-access, shared, actions
├── infrastructure/auth/      # Supabase SDK wrappers (auth + edge only, NOT data)
│   ├── server.ts   admin.ts   proxy.ts   config.ts
├── lib/                      # cross-cutting: api-client, api-error, arabic, nav, utils
└── proxy.ts                  # edge guard → infrastructure/auth/proxy
```

**The dependency rule (inward-only):**

```
app/ (routing)  ──►  features/*/server/ (DB shells)  ──►  domain/ (pure)
       │                     │
       └──► infrastructure/auth/ (Supabase SDK)      lib/ (shared utils)
```

- **`domain/`** — pure functions, no I/O. Never import Drizzle, Supabase, or Next here. This is what the unit tests exercise; pure functions take an injectable `referenceDate` for deterministic date tests.
- **`features/*/server/`** — impure shells that fetch with a `Db` client and delegate to the pure functions (e.g. `computeJuzProgress` fetches, then calls `computeJuzProgressPure`).
- **`features/*/components/`** — feature-specific React components.
- **`infrastructure/auth/`** — Supabase JS SDK wrappers, used **only** for auth and the edge proxy's `users` lookup — never for data queries.
- **`lib/`** — `api-client` (client fetch helpers), `api-error` (`sanitizeError`), `arabic`, `nav`, `utils` (`cn`, `todayDateString`).

---

## 4. The two database-access layers (critical to understand)

The app talks to Postgres through **two different paths**, deliberately:

### 4.1 Drizzle ORM — all data queries
- `src/db/client.ts` → `getDb()` returns a Drizzle client (`Db | null`) over the `pg` pool using `DATABASE_URL`.
- Used by **every** server-side data query: API routes, RSC pages, server actions, feature server shells.
- Connects as Supabase's `postgres` role → **BYPASSES Row-Level Security**. All row scoping is enforced in **application code**.
- Server-only (the `pg` Node driver cannot run at the edge).
- Schema source of truth: `src/db/schema.ts`. JS property names are **snake_case** to match DB columns.
- Migrations: `drizzle/migrations/`, generated via `npm run db:generate`.

### 4.2 Supabase JS SDK — auth + edge only
Used **only** for:
- **Auth:** `supabase.auth.getUser()`, `signInWithPassword()`, `signOut()`, and `admin.auth.admin.createUser()/deleteUser()/updateUserById()`.
- **Edge proxy** (`src/proxy.ts`): the `pg` driver can't run at the edge, so the proxy uses the Supabase SDK for its single `users` table lookup during request routing.
- Clients: `createSupabaseServerComponentClient()` (readonly cookies, RSC), `createSupabaseServerActionClient()` (writable cookies, Server Actions), `createSupabaseAdminClient()` (service-role key — auth admin ops only).

> **Rule (now security-critical):** never use the Supabase SDK `.from()` for data queries — use Drizzle. Because RLS is not the app's boundary and the RLS file is stale (see the security audit, finding M1), a stray `.from()` data query would be both broken and unsafe.

---

## 5. Authentication & authorization

### 5.1 Login flow
1. Login is **username + password**. Supabase Auth requires an email, so usernames map to synthetic emails via `usernameToEmail()` → `<username>@<AUTH_EMAIL_DOMAIN>` (default domain `noor-al-eman.local`). See `src/features/auth/shared.ts`, `actions.ts`.
2. `loginAction` (Server Action) calls `signInWithPassword`, then looks up the app `users` row by shared UUID, verifies `is_active`, and redirects to `roleHomePath(role)`.
3. A Supabase auth user is joined to its `public.users` row **by shared `id` (UUID)**.

### 5.2 Guards
- **RSC pages:** `requireRole("admin" | "teacher")` / `getCurrentAppUser()` in `src/features/auth/session.ts` — call at the top of protected pages; redirects on failure.
- **Edge proxy:** `src/proxy.ts` → `updateSupabaseSession()` refreshes the session cookie and enforces path-level role gating. Matcher: `["/login", "/admin/:path*", "/teacher/:path*"]` — **note `/api/*` is not matched**, so API routes are guarded solely by their in-handler checks.
- **API routes:** `getApiContext()` (`src/features/auth/api-context.ts`) is the single entry gate:
  1. Supabase `auth.getUser()` → 401 if absent.
  2. `getDb()` → 500 if null.
  3. `getApiAppUser(db, user.id)` → 403 if missing/inactive.
  4. Returns `{ ok: true, db, appUser }` or `{ ok: false, response }`.

### 5.3 Roles
| Helper (`features/auth/shared.ts`) | Meaning |
|---|---|
| `isSuperAdmin(role)` | `role === "super_admin"` |
| `isAdmin(role)` | `admin` **or** `super_admin` |
| (teacher) | `role === "teacher"` — gender-scoped |

> The DB `users.role` CHECK allows `('admin','teacher','super_admin')`. (CLAUDE.md's older "two roles only" line predates super-admin — the code and schema are authoritative: **three roles**.)

### 5.4 Authorization rules (enforced in code, not RLS)
- **admin / super_admin:** see and manage everything.
- **teacher:** gender-scoped — sees students matching their own `gender`, unless `can_view_all_genders = true` (then all). The old `teacher_student_assignments` model was **removed** (migration 0004); scoping is gender-only, and teacher↔student relationships are implicit via `sessions.teacher_id`.
- Teachers may edit/delete only sessions they recorded (`teacher_id === appUser.id`); admins edit/delete any.
- Shared helpers: `getApiAppUser`, `canAccessStudent` in `src/features/auth/student-access.ts` (take `Db` first). `canAccessStudent` = admin → true; teacher → gender match or `can_view_all_genders`.

### 5.5 Role permissions matrix
| Capability | super_admin | admin | teacher |
|---|:---:|:---:|:---:|
| View / create students | ✅ all | ✅ all | ✅ gender-scoped |
| Edit student info / status / initial memorization | ✅ | ✅ | ✅ (in scope) |
| Delete students (soft→withdrawn / hard) | ✅ | ✅ | ❌ |
| Record sessions | ✅ | ✅ | ✅ (auto-attributed) |
| Edit/delete sessions | ✅ all | ✅ all | ✅ own only |
| Grant ijazat | ✅ | ✅ | ✅ (in scope) |
| Revoke ijazat | ✅ | ✅ | ❌ |
| Manage teachers | ✅ | ✅ | ❌ |
| Manage admins | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |
| View reports | ✅ all | ✅ all | ✅ scoped |

---

## 6. Data model

Source of truth: `src/db/schema.ts`. Key tables:

| Table | Purpose / notable columns |
|-------|---------------------------|
| `users` | Staff accounts. `id` (UUID, = auth user id), `name`, `username` (UNIQUE), `role` (CHECK admin/teacher/super_admin), `phone`, `gender`, `can_view_all_genders`, `is_active`, `created_at`. |
| `students` | `id`, personal info (`name`, `gender`, `birth_date`, `guardian_name`, `guardian_phone`, `enrollment_date`, `notes`), `status` (active/paused/graduated/withdrawn) + `status_since`, and **denormalized caches**: `memorized_juz_count`, `ijaza_juz_count`, `last_session_date`. 7 indexes. |
| `sessions` | A recitation session. `student_id` (NOT NULL FK), `teacher_id` (NOT NULL FK → users), `session_date`, `overall_rating`, `notes`. |
| `session_items` | One recited portion per row (migration 0005): `session_type` (`new_memorization`/`review`), `surah_id`, `from_ayah`, `to_ayah`, `rating`, optional `pages`, `notes`. **`ON DELETE CASCADE`** with parent session. A session may mix new memorization and review. |
| `attendance` | Auto-derived, **present-only** (status CHECK = `present`). One row per day a student had a session. No absence/excused tracking. |
| `ijazat` | Certifications. `student_id`, `ijaza_type` (`juz`/`full_quran`), `juz_number` (1–30 for juz type), `granted_by` (FK → users). |
| `initial_memorization` | Pre-existing memorization (hefz) at enrollment. Unique (`student_id`,`juz_number`). `pages` (smallint, nullable, CHECK 1–23): when set = **partial** juz (N pages); when null = full juz. |
| `surahs` | 114 surahs (reference data). |
| `juz_boundaries` | 30 juz → surah + ayah-range boundaries (reference data). |
| `juz_pages` | 665 rows: each page within each juz → exact surah + ayah range(s). Used for partial init-mem coverage. Seeded from `juz_pages.json` via `scripts/seed-juz-pages.js`. |
| `audit_logs` | `user_id`, `username`, `action`, `entity_type`, `entity_id`, `method`, `path`, `status_code`, `request_body` (jsonb), `response_body` (jsonb). |

> **Removed:** `teacher_student_assignments` (created in migration 0000, dropped in `0004_nifty_apocalypse.sql`). ⚠️ Two DELETE routes and `supabase/legacy/rls.sql` still reference it — see security audit C1 and M1.

**Migrations & seed:**
- Migrations in `drizzle/migrations/` (`npm run db:generate`); apply via Supabase SQL editor or `npm run db:push` (dev).
- `supabase/legacy/schema.sql` (original full schema, superseded), `rls.sql` (RLS — applied manually, **stale**), `seed.sql` (surahs + juz boundaries). See `supabase/legacy/README.md` for fresh-DB setup order.

**Connection:** the direct `db.*.supabase.co` host is IPv6-only and often unreachable; use the **Supavisor pooler** URL (IPv4, port 6543):
```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

---

## 7. The progress engine (core domain logic)

`src/domain/progress.ts` is the heart of the app — a **pure function** (`computeJuzProgressPure`) with no I/O. The DB-fetching shell (`computeJuzProgress`) lives in `src/features/students/server/progress.ts`. **Preserve the pure/impure split** — the pure function is what unit tests exercise, with an injectable `referenceDate`.

**Algorithm — per juz (1–30):**
1. Intersect recorded session items (ayah ranges from `session_items` joined to `sessions`) against `juz_boundaries`, unioning overlapping ranges per surah, to compute ayah-level coverage.
2. `initial_memorization` rows count as covered: a null-`pages` row = full juz; a row with `pages` = partial coverage computed from exact page→ayah ranges in `juz_pages` (not a proportional estimate). Overall coverage = max(session coverage, init-mem page coverage).
3. Assign a color:
   - **green** — has ijaza (formal `ijazat` of type `juz`/`full_quran`, or init-mem `with_ijaza`).
   - **blue** — ≥70% covered, not weak-dominant, active within 30 days.
   - **yellow** — covered but stale or weak-dominant.
   - **gray** — untouched.

**Denormalized caches** (`students.memorized_juz_count` = blue+green count, `ijaza_juz_count` = juz with ijaza, `last_session_date`) are recomputed by `recalculateStudentSummary()` (`features/students/server/recalc.ts`) after any progress-affecting mutation. `backfill.ts` reruns this across all students. `pages` on an init-mem row affects coverage/color but **not** `memorized_juz_count` (each init-mem row still counts as 1 juz).

**Related pure engines:**
- **Spaced-repetition review** (`domain/review.ts`): `computeReviewSchedule(targetDate, items)` applies 1-day / 7-day / 30-day look-back rules; only `new_memorization` items schedule reviews. Exposed at `GET /api/students/[id]/review?date=YYYY-MM-DD` and inline in the new-session form (`RecommendedReview`).
- **Attendance** (`domain/attendance.ts`): `computeAttendanceCalendar` returns present-only days derived from sessions; persisted by `recalculateStudentAttendance`. `GET /api/students/[id]/attendance` → `{ records, stats: { total, thisMonth } }` (no POST/DELETE).

---

## 8. API surface (`src/app/api/**`)

All routes use `getApiContext()`. All mutations that touch progress call the relevant `recalculate*`. All error responses go through `sanitizeError()`.

| Route | Methods | Access | Notes |
|-------|---------|--------|-------|
| `/api/students` | GET, POST | all roles (scoped) | GET paginated (pageSize 25) + `ilike` search; POST transactional (student + init-mem) then recalc. |
| `/api/students/[id]` | GET, PUT, DELETE | GET/PUT scoped; DELETE admin | PUT edits + init-mem rewrite (⚠ not transactional — H2); DELETE soft (withdrawn) or `?permanent=true` (⚠ not transactional — M3). |
| `/api/students/[id]/progress` | GET | scoped | Detailed progress map via `computeJuzProgressDetailedPure`. |
| `/api/students/[id]/review` | GET | scoped | Spaced-repetition schedule. |
| `/api/students/[id]/attendance` | GET | scoped | Present-only records + stats. |
| `/api/students/[id]/sessions` | GET | scoped | Student's sessions. |
| `/api/sessions` | GET, POST | scoped | POST transactional (session + items); teacher auto-attributed as `teacher_id`; then recalc. |
| `/api/sessions/[id]` | GET, PUT, DELETE | own (teacher) / any (admin) | PUT transactional; recalc after commit. |
| `/api/ijazat` | GET, POST | scoped | Grant (validates type + juz 1–30, `granted_by`). |
| `/api/ijazat/[id]` | DELETE | admin only | Revoke + recalc. |
| `/api/teachers` | GET, POST | admin | POST creates auth user + `users` row, rollback on failure. |
| `/api/teachers/[id]` | GET, PUT, DELETE | admin | ⚠ DELETE references dropped table + destroys sessions (C1). |
| `/api/admins` | GET, POST | super_admin | Creates admin auth user + row. |
| `/api/admins/[id]` | GET, PUT, DELETE | super_admin | Self-edit/delete blocked; ⚠ DELETE dead-table bug (C1). |
| `/api/audit-logs` | GET | super_admin | Paginated (pageSize max 100), filters. |
| `/api/auth/me` | GET | authenticated | `{ id, name, role }` for current user. |
| `/api/reports/parent-report` | POST | scoped | Puppeteer → PDF for one student (`week`/`month`/`enrollment`). |
| `/api/reports/students-stats` | GET | scoped | Aggregate stats. |
| `/api/surahs` | GET | authenticated | Reference data. |

---

## 9. Routing structure

Route groups: `(auth)/login`, `(admin)/admin/*`, `(teacher)/teacher/*`, plus `app/api/*`. Sidebar/nav is **data-driven** from `src/lib/nav.ts` (`getNavItems(role)`) — add a nav entry there, not in a layout. Admin and teacher have parallel feature sets (students, sessions, ijazat, reports) with different scoping. There is **no** separate attendance page or assignments page — attendance is auto-derived (shown as stat cards in the sessions tab), and teacher↔student relationships are implicit via session records.

---

## 10. Conventions

- **UI text is Arabic + RTL.** Keep new user-facing strings Arabic and RTL-aware.
- **shadcn/ui** (new-york) base components in `src/components/ui/`; add with `npx shadcn@latest add <component>`. Icons: `lucide-react`. Merge classes with `cn()`.
- **Domain enums** are string-literal unions matched by DB CHECK constraints — keep TS unions and SQL constraints in sync (`session_type`, `rating`, `ijaza_type`, `status`, `role`, `gender`).
- **Data queries → Drizzle** (`getDb()` + `db.select().from(table)`). **Auth queries → Supabase SDK**. Never `.from()` for data.
- **Error handling:** Drizzle throws (no `error` field). Use `sanitizeError()` in catch blocks; never return raw `error.message` to clients.
- **Client fetching:** `apiGet/apiPost/apiPut/apiDelete` from `@/lib/api-client` (JSON parsing + `ApiError` normalization).
- **Phone validation:** Egyptian format `^01[0125]\d{8}$`, enforced in `validateStudentPayload` (server) and the forms (client).
- **Timezone:** `todayDateString()` uses `Africa/Cairo` — "today" rolls over at Cairo midnight, not UTC.
- **Responsive tables:** dual-render — `<table>` for `sm+` and cards for mobile (`hidden sm:block` + `sm:hidden`). See `admin-ijazat-table.tsx`.
- **Session form:** create mode starts with zero items (teacher adds each via "إضافة عنصر"); date picker `max={today}`; `validateSessionPayload` enforces no future dates server-side via `todayDate`.

---

## 11. Environment variables

| Variable | Where read | Purpose | Exposure |
|----------|-----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | `infrastructure/auth/config.ts` | Supabase project URL | public (client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `config.ts` | Anon/publishable key | public (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | `config.ts` → `admin.ts` | Auth admin ops (create/delete users) | **server-only** |
| `DATABASE_URL` | `db/client.ts` | Postgres pooler connection | **server-only** |
| `AUTH_EMAIL_DOMAIN` | `features/auth/shared.ts` | Synthetic-email domain (default `noor-al-eman.local`) | server |
| `NEXT_PUBLIC_APP_NAME` | layout / app-shell / login | Display name | public |

`.env*` is git-ignored. Never move `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` to a `NEXT_PUBLIC_` name.

---

## 12. Testing

Vitest (`vitest.config.ts`); tests co-located as `*.test.ts` in `src/domain/`. The **pure** functions are unit-tested: `computeJuzProgressPure`, `computeJuzProgressDetailedPure`, `computeAttendanceCalendar`, `computeDayAttendance`, `validateSessionPayload`, `validateStudentPayload`, `validateInitialMemorization`, `getLevelInfo`, `countsFromInitialMemorization`, `computeReviewSchedule`, `groupReviewsByRule`. DB-fetching shells are not unit-tested (they need a live DB). `npm run build` is the CI-equivalent typecheck.

---

## 13. Deployment notes

- **Build:** `npm run build` must pass with zero type errors (primary typecheck).
- **Runtime split:** the proxy runs at the **edge** (Supabase SDK only, no `pg`); everything else (API routes, RSC) runs in the Node runtime because Drizzle uses the `pg` driver.
- **Puppeteer:** `/api/reports/parent-report` launches full Chromium — on serverless (Vercel) this needs `@sparticuz/chromium` or an external renderer; on a Node host (Railway/AWS) ensure Chromium deps are installed. See security audit L5.
- **DB connectivity:** always use the Supavisor pooler URL (IPv4). Enable TLS cert verification (security audit H4).
- **Per `tech-strategy.md`:** graduated hosting — Railway (agile) → AWS (scale); CI on GitHub Actions with Trivy.

---

## 14. Known limitations & drift (read before extending)

1. **CLAUDE.md says "two roles only"** — outdated; there are **three** (`super_admin` added). Code + schema are authoritative.
2. **RLS is stale/broken** and not the enforcement boundary (security audit M1). Authorization is 100% in-code.
3. **Dead `teacher_student_assignments` references** in `admins/[id]` + `teachers/[id]` DELETE and in `rls.sql` (security audit C1/M1).
4. **Non-transactional writes** in student PUT and permanent DELETE (security audit H2/M3).
5. **Denormalized caches can drift** if recalc fails post-commit (security audit M4).
6. **No multi-tenancy** — no `tenant_id`/`org_id` anywhere. Single-halaqa only (see the multi-tenant scaling plan).

---

## 15. Where to look first (task → file)

| I want to… | Start at |
|---|---|
| Change how progress/colors are computed | `src/domain/progress.ts` (pure) + `features/students/server/progress.ts` (shell) |
| Add/adjust an API endpoint | `src/app/api/**` — copy the `getApiContext()` pattern |
| Change auth/role rules | `features/auth/{session,api-context,student-access,shared}.ts`, `src/proxy.ts` |
| Add a DB column/table | `src/db/schema.ts` → `npm run db:generate` → apply migration |
| Add a nav item | `src/lib/nav.ts` |
| Change review scheduling | `src/domain/review.ts` |
| Adjust the parent PDF | `features/reports/server/{generate-parent-report,parent-report-html}.ts` |
| Add a shared UI component | `npx shadcn@latest add <c>` → `src/components/ui/` |
