# Iqra (اقرأ) — Security & Architecture Audit

**Date:** 2026-08-27
**Scope:** Full-stack review of the Next.js 16 + Supabase + Drizzle codebase (`src/**`, `next.config.js`, `drizzle/**`, `supabase/legacy/**`, `package.json`).
**Method:** First-hand read of every API route, the auth layer, the DB client, the schema, the RLS policy file, and the edge proxy; `npm audit`; dependency version verification; migration cross-check.
**Perspective:** Senior full-stack + application-security + architecture review, plus business-logic risk.

> **Note on secrets:** This report never prints secret *values*. Only environment-variable *names* and file locations appear. No credential material was extracted.

---

## 1. Executive Summary

The application is **well-structured** (clean layering, pure domain core, consistent `getApiContext()` auth boilerplate, sanitized error responses, audit logging on privileged mutations). Those are real strengths and are called out in §6.

However, the security posture rests on a **single load-bearing assumption** that is not currently backed by any secondary control:

> **All authorization is enforced in application code only.** The Drizzle client connects via `DATABASE_URL` as Supabase's `postgres` role, which has `BYPASSRLS`. Row-Level Security is therefore **not** an enforcement boundary for the app — and the RLS policy file that *was* meant to be the second layer is **stale and partially broken** (it references a table dropped in migration `0004`). There is **no database-level safety net**: a single missing or wrong check in a route handler is a direct data breach or data-loss event, with nothing behind it.

That meta-risk amplifies everything else. The concrete findings that matter most:

| # | Headline risk | Severity |
|---|---------------|----------|
| **C1** | Deleting a teacher/admin destroys session history, corrupts progress caches, and then crashes on a dropped table — leaving the user un-deleted | **Critical** |
| **H1** | `next@16.2.9` ships with known HIGH CVEs, including an App-Router **proxy/middleware bypass** (the proxy is the page-level auth guard) | **High** |
| **H2** | Student edit (`PUT`) deletes + re-inserts initial-memorization rows **without a transaction** → partial failure = permanent data loss | **High** |
| **H3** | **No rate limiting** anywhere — login and all APIs are open to brute force / credential stuffing / DoS | **High** |
| **H4** | DB connection disables TLS certificate validation (`rejectUnauthorized: false`) → MITM on the database link | **High** |
| **M1–M7** | Broken/stale RLS, missing security headers, non-atomic deletes, cache drift, weak/inconsistent password policy, over-broad teacher access, unilateral ijaza granting | **Medium** |

**Recommended posture:** treat **C1 + H1–H4** as a release blocker set (P0/P1). None require architectural change; all are bounded fixes. The Medium items are the difference between "works" and "safe to grow."

---

## 2. Severity summary

| Severity | Count | IDs |
|----------|-------|-----|
| Critical | 1 | C1 |
| High | 4 | H1, H2, H3, H4 |
| Medium | 7 | M1, M2, M3, M4, M5, M6, M7 |
| Low | 6 | L1, L2, L3, L4, L5, L6 |

Severity uses the project's own scale (`.claude/rules/security.md`): **Critical/High = must fix before merge/release; Medium = should fix; Low = optional.**

---

## 3. Trust boundaries & why RLS is not protecting you

```
                    ┌─────────────────────────────────────────────┐
  Browser  ─────►   │  Edge proxy (src/proxy.ts → proxy.ts)       │
 (anon key,         │  Supabase JS SDK + user JWT                 │
  user JWT,         │  Guards PAGES only: /admin/*, /teacher/*,   │
  cookies)          │  /login.  Does NOT match /api/*.            │
                    └───────────────┬─────────────────────────────┘
                                    │
        ┌───────────────────────────┴─────────────────────────────┐
        │                                                         │
        ▼                                                         ▼
 ┌──────────────────┐                              ┌──────────────────────────┐
 │  RSC pages       │                              │  API routes /api/**      │
 │  requireRole()   │                              │  getApiContext()         │
 │  (Supabase auth +│                              │  (Supabase auth +        │
 │   Drizzle lookup)│                              │   Drizzle lookup)        │
 └────────┬─────────┘                              └────────────┬─────────────┘
          │                                                     │
          └───────────────────────┬─────────────────────────────┘
                                  ▼
                     ┌──────────────────────────────┐
                     │ Drizzle (pg) via DATABASE_URL│
                     │  role = postgres → BYPASSRLS │   ◄── RLS never evaluated here
                     └──────────────────────────────┘

  Second, parallel path (public anon key ships in the browser bundle):
  Browser ──► Supabase PostgREST (api.<ref>.supabase.co) ──► RLS-enforced tables
             └── this path IS governed by rls.sql (currently stale/broken)
```

**Consequences:**

1. Every data query in the app takes the **left/lower** path (Drizzle → `postgres` → BYPASSRLS). RLS is irrelevant to it. So **100% of authorization is the in-code checks** in `getApiContext()`, `canAccessStudent()`, and the inline role/gender checks in each route.
2. The **right** path (anon key + PostgREST) is reachable by anyone who reads the public anon key from the shipped JS. Today it is *mostly* fail-closed (see **M1**) — grants are `TO authenticated` only, so logged-out users get nothing, and the teacher policies error out because they call a function that references a dropped table. But an authenticated **admin** JWT can still read/write core tables directly through PostgREST, **bypassing all app validation and audit logging**.
3. The moment anyone reintroduces a Supabase-SDK `.from()` data query (CLAUDE.md forbids it — that rule is now *load-bearing security*, not style), they inherit the broken RLS and are exposed.

---

## 4. Findings

### C1 — Deleting a teacher/admin destroys history, skips recalculation, and crashes on a dropped table
- **Severity:** Critical · **CWE-460** (improper cleanup on throw) + **CWE-691** (insufficient control flow) · data-loss
- **Location:** [teachers/[id]/route.ts:169-173](src/app/api/teachers/[id]/route.ts#L169-L173), [admins/[id]/route.ts:169-175](src/app/api/admins/[id]/route.ts#L169-L175)
- **What happens** (teacher delete, in order):
  1. `await db.delete(sessionsTable).where(eq(sessionsTable.teacher_id, id))` — **permanently deletes every session this teacher ever recorded** (each session's `session_items` cascade with it).
  2. `await db.execute(sql\`DELETE FROM teacher_student_assignments ...\`)` — **throws**: `teacher_student_assignments` was dropped in migration `0004_nifty_apocalypse.sql`. The relation does not exist.
  3. Lines 4–5 (`delete users`, `admin.auth.admin.deleteUser`) **never run**. The `catch` returns 500.
- **Net effect of "delete a teacher":**
  - The teacher is **not** deleted — the `users` row and the Supabase auth user both survive, so **the teacher can still log in**.
  - All sessions they recorded are **gone** (not rolled back — no transaction).
  - Every student who had those sessions now has a **corrupted denormalized cache** (`memorized_juz_count`, `ijaza_juz_count`, `last_session_date`) because `recalculateStudentSummary` is never called for them. Progress is silently overstated.
  - The operator sees a generic 500 and has no idea history was destroyed.
- **Admin delete** has the identical shape (deletes ijazat by `granted_by`, sessions by `teacher_id`, then the dead-table line throws).
- **Remediation (two parts):**
  1. **Immediate (P0):** remove the dead-table statements and wrap cleanup in a transaction.
  2. **Design (P1):** hard-deleting a user should not silently destroy the student history they authored. `sessions.teacher_id` is `NOT NULL`, so you cannot null it. Choose a policy: **(a)** block deletion when `sessions` exist and require deactivation (`is_active=false`) instead — recommended; or **(b)** reassign those sessions to a system/"former teacher" placeholder user; or **(c)** if deletion truly must cascade, recompute every affected student afterwards **inside the same transaction**.

  Recommended P0 shape (teacher route), option (a):
  ```ts
  // teachers/[id]/route.ts — DELETE
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(eq(sessionsTable.teacher_id, id));

  if (count > 0) {
    return Response.json(
      { error: "لا يمكن حذف معلّم لديه جلسات مسجّلة. قم بإلغاء تفعيل الحساب بدلاً من ذلك." },
      { status: 409 }
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(usersTable).where(eq(usersTable.id, id));
  });
  await admin.auth.admin.deleteUser(id); // outside tx; auth system is not transactional
  ```
  Delete the `db.execute(sql\`DELETE FROM teacher_student_assignments ...\`)` line entirely in **both** routes.
- **Regression test:** unit-test the "teacher with sessions cannot be hard-deleted" branch; integration test that a delete never leaves an orphaned auth user or an un-recalculated student.

---

### H1 — `next@16.2.9` has known HIGH-severity vulnerabilities (incl. proxy/middleware bypass)
- **Severity:** High · **OWASP A06:2021 (Vulnerable & Outdated Components)** · **CWE-1035**
- **Evidence:** `npm audit` reports `next` in the vulnerable range with, among others:
  - *Middleware / Proxy bypass in App Router applications* (GHSA-6gpp-xcg3-4w24) — **directly relevant**: `src/proxy.ts` is the page-level auth guard for `/admin/*` and `/teacher/*`.
  - *SSRF in Server Actions on custom servers* (GHSA-89xv-2m56-2m9x), *SSRF in rewrites* (GHSA-p9j2-gv94-2wf4).
  - *Unauthenticated disclosure of internal Server Function endpoints* (GHSA-955p-x3mx-jcvp).
  - Multiple DoS (Server Actions, Image Optimization SVG), cache-confusion advisories.
- **Impact:** a proxy bypass could let an unauthenticated or wrong-role request reach `/admin/*`/`/teacher/*` pages. Note the API routes do **not** rely on the proxy (they re-check via `getApiContext()`), which limits blast radius — but pages that only rely on the proxy would be exposed. Defense-in-depth (see L-note below) matters here.
- **Remediation:** upgrade to the latest patched Next.js 16 (`npm i next@latest` → currently `16.3.3+`). Re-run `npm run build` (the project's primary typecheck) and the test suite. Verify `proxy.ts` still behaves (Next 16 renamed middleware→proxy; confirm the patched release keeps that contract via `node_modules/next/dist/docs/`).
- **Secondary control:** ensure **every** `/admin/*` and `/teacher/*` page calls `requireRole(...)` at the top (RSC guard) so page protection does not depend on the proxy alone. Audit the route-group layouts to confirm.

---

### H2 — Student `PUT` rewrites initial-memorization without a transaction (data-loss window)
- **Severity:** High · **CWE-662** (improper synchronization / non-atomic multi-step write) · data-loss
- **Location:** [students/[id]/route.ts:138-156](src/app/api/students/[id]/route.ts#L138-L156)
- **Detail:** the handler does `DELETE FROM initial_memorization WHERE student_id = id` → `INSERT` new rows → `UPDATE students`, all as **separate statements with no `db.transaction`**. If the process dies or the DB errors between the delete and the insert (or the insert partially fails), the student's entire initial-memorization record is **gone** with no rollback. This directly feeds progress computation, so the student's memorization map is corrupted.
- **Contrast:** `sessions` POST/PUT and `students` POST already use `db.transaction` correctly — this route is the outlier.
- **Remediation:** wrap the init-mem delete+insert **and** the student update in one transaction; run `recalculateStudentSummary` *after* commit (it's a read+cache-write, safe outside):
  ```ts
  const data = await db.transaction(async (tx) => {
    if ("initial_memorization" in body) {
      await tx.delete(initialMemorizationTable).where(eq(initialMemorizationTable.student_id, id));
      if (initRows.length > 0) await tx.insert(initialMemorizationTable).values(rowsToInsert);
    }
    const [row] = await tx.update(studentsTable).set(updates).where(eq(studentsTable.id, id)).returning();
    return row;
  });
  await recalculateStudentSummary(db, id);
  if (statusChanged) await recalculateStudentAttendance(db, id);
  ```
- **Regression test:** simulate an insert failure mid-update and assert the original init-mem rows survive (transaction rollback).

---

### H3 — No rate limiting on login or any API route
- **Severity:** High · **CWE-307** (improper restriction of excessive auth attempts) · **OWASP A07:2021**
- **Location:** [features/auth/actions.ts:35-44](src/features/auth/actions.ts#L35-L44) (login), all of `src/app/api/**`.
- **Detail:** `loginAction` calls `signInWithPassword` with no attempt throttling, lockout, or backoff. The generic error message (good — no user enumeration) does nothing against automated brute force. All API routes are likewise unthrottled → credential stuffing, password spraying, and cheap DoS (esp. the Puppeteer PDF route, see L5).
- **Remediation options (pick one, apply to login first):**
  - **Edge/durable:** `@upstash/ratelimit` + Upstash Redis, keyed by client IP (`request.headers.get("x-forwarded-for")`) and username. Cleanest for serverless.
  - **DB-based:** a `login_attempts` table (ip, username, ts); count failures in the last N minutes; block over threshold. No new infra.
  - Apply a general per-IP limiter in a shared API wrapper for state-changing methods.
- **Note:** login is a **Server Action**, not matched by the proxy for POST semantics, so implement the limiter *inside* `loginAction` (and any future auth actions), not only in the proxy.
- **Regression test:** assert the (N+1)th failed attempt within the window is rejected before hitting Supabase.

---

### H4 — Database TLS certificate validation is disabled
- **Severity:** High · **CWE-295** (improper certificate validation) · **OWASP A02:2021**
- **Location:** [db/client.ts:49](src/db/client.ts#L49) — `ssl: { rejectUnauthorized: false }`
- **Detail:** the `pg` pool connects to the Supabase pooler with certificate verification **off**. TLS still encrypts, but the client will accept **any** certificate — a network attacker who can intercept the connection to `*.pooler.supabase.com` can present a forged cert and MITM the entire database link (all student PII, credentials-in-transit for auth queries, everything). The inline comment ("pooler uses SNI, so don't pin a hostname") conflates hostname pinning with CA verification — you can verify the CA without pinning a hostname.
- **Remediation:** enable verification against Supabase's CA. Download the Supabase CA certificate (Dashboard → Database → SSL) and pass it:
  ```ts
  import { readFileSync } from "node:fs";
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.SUPABASE_CA_CERT ?? readFileSync(process.env.SUPABASE_CA_CERT_PATH!, "utf8"),
  },
  ```
  Store the CA PEM in an env var / secret (it is not sensitive, but keep config out of code). If the pooler currently presents a publicly-trusted chain, `ssl: { rejectUnauthorized: true }` alone may suffice — verify with a connection test before shipping.
- **Regression test:** connection smoke test in CI that fails if `rejectUnauthorized` is false in any environment.

---

### M1 — RLS policies are stale, partially broken, and not the enforcement boundary
- **Severity:** Medium · **CWE-285** (improper authorization) / defense-in-depth failure
- **Location:** [supabase/legacy/rls.sql](supabase/legacy/rls.sql) (whole file)
- **Detail:**
  - The file grants `authenticated` direct `SELECT/INSERT/UPDATE` on `students`, `sessions`, `attendance`, `ijazat` and references `teacher_student_assignments` (lines 4, 14, 45–67) — **dropped in migration 0004**. The `is_assigned()` SECURITY DEFINER function (lines 37–53) selects from that dropped table, so any teacher policy that calls it **errors at runtime**.
  - `is_admin()` (line 32) checks `role = 'admin'` only — it **excludes `super_admin`**, which the app treats as an admin. Inconsistent.
  - The model is still **assignment-based**, but the app moved to **gender-based** scoping.
  - Because Drizzle bypasses RLS entirely (H-context §3), these policies protect nothing on the app's own path. They *only* govern the public-anon-key/PostgREST path — where an **admin JWT can still read/write core tables directly, bypassing app validation and audit logging**.
- **Remediation (choose a strategy and commit to it):**
  - **If RLS is to be a real second layer (recommended, and mandatory for multi-tenant — see scaling plan):** rewrite `rls.sql` to match the current gender-based model, include `super_admin`, drop all `teacher_student_assignments` references, and — critically — have the app connect Drizzle as a **non-BYPASSRLS role** that sets the request's user context (e.g. via `SET LOCAL request.jwt.claims`), so RLS actually evaluates. This is a significant change; scope it deliberately.
  - **If RLS is *not* to be relied on (status quo):** then **revoke** the `authenticated` grants so the anon-key/PostgREST path is fully closed, delete the broken policies/functions, and document in CLAUDE.md that PostgREST is intentionally disabled for data. This removes the admin-bypass-audit hole and the "false sense of security."
- **Regression test:** an integration probe that hits PostgREST with a valid non-admin JWT and asserts it cannot read `students`.

---

### M2 — No HTTP security headers
- **Severity:** Medium · **CWE-693** (protection mechanism failure) · **OWASP A05:2021**
- **Location:** [next.config.js](next.config.js) — empty config, no `headers()`.
- **Missing:** `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` (clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Remediation:** add an `async headers()` block. Starting point (tune CSP against the Supabase URL and any inline needs):
  ```js
  const nextConfig = {
    async headers() {
      const csp = [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}`,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");
      return [{
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      }];
    },
  };
  module.exports = nextConfig;
  ```
  Ship CSP in `Content-Security-Policy-Report-Only` first to catch breakage, then enforce.

---

### M3 — Permanent student delete is not transactional
- **Severity:** Medium · **CWE-662**
- **Location:** [students/[id]/route.ts:233-238](src/app/api/students/[id]/route.ts#L233-L238)
- **Detail:** five sequential deletes (init-mem, ijazat, attendance, sessions, then student) with no transaction. A failure mid-sequence leaves orphaned child rows or a half-deleted student.
- **Remediation:** wrap all five in `db.transaction`. (Longer term, define these FKs as `ON DELETE CASCADE` in the schema so a single `delete(studentsTable)` suffices — the code comment on line 231 notes they currently are not.)

---

### M4 — Denormalized caches can drift; recalculation runs outside the write transaction
- **Severity:** Medium · **CWE-662** / data-consistency
- **Location:** all mutation routes calling `recalculateStudentSummary` / `recalculateStudentAttendance` after commit (e.g. [students/[id]/route.ts:158-162](src/app/api/students/[id]/route.ts#L158-L162), sessions routes), plus the C1 delete paths that never recalc.
- **Detail:** `students.memorized_juz_count`, `ijaza_juz_count`, `last_session_date` are caches. They are refreshed *after* the write commits, in a separate call. If recalc throws (or the process dies) after the write, the write persists but the cache is stale — progress dashboards silently lie. There is no reconciliation trigger; only the manual `backfill.ts` fixes it.
- **Remediation:**
  - Short term: ensure **every** mutation path (including the C1 delete fix) calls recalc for **all** affected students, and log loudly if recalc fails so drift is detectable.
  - Medium term: schedule `backfill.ts` as a periodic reconciliation job (cron) and/or move the cache derivation into a DB trigger or a computed view so it cannot drift.
- **Regression test:** after each mutation type, assert the cache equals a fresh `computeJuzProgress` result.

---

### M5 — Weak and inconsistent password policy
- **Severity:** Medium · **CWE-521** (weak password requirements)
- **Location:** [admins/route.ts:46](src/app/api/admins/route.ts#L46) and [teachers/route.ts:46](src/app/api/teachers/route.ts#L46) (creation: **no length/complexity check at all**), vs [admins/[id]/route.ts:44](src/app/api/admins/[id]/route.ts#L44) and [teachers/[id]/route.ts:91](src/app/api/teachers/[id]/route.ts#L91) (update: `length < 6`).
- **Detail:** account **creation** enforces no password strength (relies on Supabase's default minimum); **updates** enforce only ≥6 chars. Six characters is well below current guidance.
- **Remediation:** centralize a `validatePassword()` helper (min length ≥ 12 recommended, reject common passwords) in `domain/` and call it in **all four** places (both creates, both updates). Keep messages Arabic.
- **Regression test:** unit tests over `validatePassword` covering min length and a common-password blocklist sample.

---

### M6 — Over-broad teacher access (gender-only scoping, no "my students" concept)
- **Severity:** Medium (business/privacy) · **CWE-1220** (insufficient granularity of access control) · least-privilege
- **Location:** [features/auth/student-access.ts](src/features/auth/student-access.ts) `canAccessStudent`; enforced across student/session/ijaza routes.
- **Detail:** any active teacher can read and modify **every** student of their gender (or all students if `can_view_all_genders`): guardian name + phone (**PII**), status, initial memorization, and can record sessions and grant ijazat for any of them. There is no notion of "the students I actually teach." This is *by design* per CLAUDE.md, but from a privacy/least-privilege standpoint it is a broad blast radius: one compromised or malicious teacher account can read/alter the whole cohort's PII and records.
- **Remediation (business decision, not a pure code fix):** if the halaqa wants tighter control, reintroduce a lightweight ownership signal (e.g. derive "my students" from `sessions.teacher_id`, or an explicit opt-in assignment) and scope *writes* (edit PII, grant ijaza) to owned students while keeping *reads* gender-wide if desired. At minimum, document the accepted risk and ensure audit logging covers cross-teacher edits (it partially does).

---

### M7 — Any teacher can unilaterally grant ijazat (including full-Quran), with no dedup or approval
- **Severity:** Medium (business-logic) · **CWE-840** (business logic errors)
- **Location:** [ijazat/route.ts](src/app/api/ijazat/route.ts) POST (grant), revoke is admin-only in [ijazat/[id]/route.ts:21](src/app/api/ijazat/[id]/route.ts#L21).
- **Detail:** granting an ijaza confers "certified"/green status — a significant, quasi-permanent record. Any accessible teacher can grant `full_quran` or per-juz ijazat with only a gender check; there is no approval workflow and (per the route) no guard against duplicate/overlapping grants. Revocation, by contrast, is correctly restricted to admins — an asymmetry that lets teachers create records they cannot undo.
- **Remediation:** add a duplicate/overlap check on grant; consider requiring admin approval (or admin-only granting of `full_quran`); ensure every grant is audit-logged with `granted_by`. This is a governance choice for the halaqa — surface it to the owner.

---

### L1 — Student `PUT` allows changing `gender`, checked against the *old* gender
- **Severity:** Low (data-integrity / authorization-model) · **CWE-639**
- **Location:** [students/[id]/route.ts:101-113](src/app/api/students/[id]/route.ts#L101-L113) (`gender` is in `allowedFields`, auth check uses `existingStudent.gender`).
- **Detail:** a gender-scoped teacher who can edit a student (old gender matches) can flip that student's `gender`, pushing them out of their own scope (or into the other gender's scope). Not privilege escalation for the actor, but it lets a teacher "move" records across scopes and mutate a field that defines the access model. Admins changing gender is legitimate.
- **Remediation:** either forbid teachers from changing `gender` (admin-only field), or re-validate access against the *new* gender with a `WITH CHECK`-style guard before persisting.

### L2 — Unvalidated date parsing in audit-logs query
- **Severity:** Low · **CWE-20**
- **Location:** `src/app/api/audit-logs/route.ts` (date-range filter builds `new Date(dateFrom)` from raw query input; route lacks the try/catch other routes have).
- **Remediation:** validate `dateFrom`/`dateTo` are ISO dates before use; wrap the handler in try/catch + `sanitizeError`.

### L3 — LIKE wildcards not escaped in student search
- **Severity:** Low (not injection — Drizzle parameterizes) · **CWE-150**
- **Location:** `src/app/api/students/route.ts` GET (`ilike(name, \`%${search}%\`)`).
- **Detail:** `%`/`_` in user input act as wildcards; only affects result relevance, not safety. Escape them for correctness.

### L4 — Dependencies behind latest / transitive dev-only CVEs
- **Severity:** Low · **OWASP A06**
- **Detail:** `lucide-react@1.22.0` (latest `1.34.0` — verified legitimate, not a supply-chain issue). `npm audit` also flags `brace-expansion`, `js-yaml`, `nanoid` (via eslint) and `esbuild` (via `drizzle-kit`) — all **transitive/dev-only** DoS advisories. `next` is the only runtime-impacting one (see H1).
- **Remediation:** `npm audit fix` for the safe set; bump `lucide-react`; handle `next` per H1. Add Dependabot/Trivy in CI (your `tech-strategy.md` mandates Trivy).

### L5 — Puppeteer/Chromium launched inside a request handler (resource + deployment risk)
- **Severity:** Low (ops) · availability
- **Location:** [reports/parent-report/route.ts:39-54](src/app/api/reports/parent-report/route.ts#L39-L54)
- **Detail:** each PDF request launches full headless Chromium with `--no-sandbox`. Unthrottled, this is a memory/CPU exhaustion vector (compounded by H3's lack of rate limiting), and full Puppeteer typically won't run on Vercel serverless without `@sparticuz/chromium` or an external render service. `--no-sandbox` also weakens the browser sandbox.
- **Remediation:** rate-limit and/or queue PDF generation; on serverless use `@sparticuz/chromium` or move rendering to a dedicated worker; drop `--no-sandbox` where the platform allows.

### L6 — CSRF posture for cookie-authenticated state-changing routes is unverified
- **Severity:** Low · **CWE-352**
- **Detail:** auth is cookie-based (Supabase SSR). API routes are same-origin `fetch`; Server Actions have Next's origin checks. Confirm cookies are `SameSite=Lax`/`Strict` and consider explicit CSRF tokens (or an origin/`Sec-Fetch-Site` check) for state-changing API routes as defense-in-depth.

---

## 5. Non-atomic cross-system account creation (noted, low)

`admins`/`teachers` POST create the Supabase **auth** user first, then insert the `users` row, with a best-effort `deleteUser` rollback on insert failure ([teachers/route.ts:94-96](src/app/api/teachers/route.ts#L94-L96)). If the rollback itself fails, an **orphaned auth user** remains and blocks recreating that username/email. Acceptable for now; document it, and consider a reconciliation script that finds auth users with no `users` row.

---

## 6. Good practices observed (keep these)

- **Consistent auth boilerplate:** every API route funnels through `getApiContext()` (401/500/403 ladder) — no route silently skips it.
- **Error sanitization:** `sanitizeError()` logs full detail server-side and returns a generic Arabic message — **CWE-209 mitigated**. Applied consistently.
- **No user enumeration on login:** single generic credential error.
- **Parameterized queries throughout:** Drizzle everywhere; the only raw `sql\`\`` uses are parameterized (and are the dead-table bug, not injection).
- **Audit logging** on privileged mutations, with passwords redacted (`password: "***"`) where logged.
- **Secrets hygiene:** `.env*` git-ignored; service-role key and `DATABASE_URL` are server-only (never `NEXT_PUBLIC_`); admin client isolated in `infrastructure/auth/admin.ts`.
- **Transactions used correctly** in sessions POST/PUT and students POST (the pattern exists — H2/M3 just need to adopt it).
- **Clean layering** (pure domain, unit-tested) makes targeted fixes low-risk.

---

## 7. Remediation implementation plan

Ceremony scaled to scope per Core Directive 6. Each fix ships on a branch off `main` with a regression test and must pass the quality gates (`npm run build`, `npm run lint`, `npm test`) before merge.

### Phase P0 — Release blockers (do first, ~1–2 days)
- [ ] **C1** — Remove both `DELETE FROM teacher_student_assignments` statements; guard teacher/admin deletion (block when sessions exist, or reassign) and wrap in a transaction; recalc affected students. *(files: `teachers/[id]/route.ts`, `admins/[id]/route.ts`)*
- [ ] **H1** — Upgrade `next` to latest 16.x; re-run build + tests; confirm proxy contract. Add `requireRole()` assertions to any `/admin`/`/teacher` layout/page missing them.
- [ ] **H2** — Wrap student `PUT` init-mem rewrite + student update in one transaction.
- [ ] **H4** — Enable DB TLS cert verification (`rejectUnauthorized: true` + CA).

### Phase P1 — High-value hardening (~2–4 days)
- [ ] **H3** — Add rate limiting to `loginAction` (and a shared limiter for state-changing APIs).
- [ ] **M1** — Decide RLS strategy: either revoke `authenticated` grants + delete broken policies (close the PostgREST path), or rewrite RLS to the gender model + run Drizzle under a non-BYPASSRLS role. Document the decision in CLAUDE.md.
- [ ] **M2** — Add security headers in `next.config.js` (Report-Only CSP → enforce).
- [ ] **M3** — Wrap permanent student delete in a transaction (or add `ON DELETE CASCADE`).

### Phase P2 — Consistency & correctness (~2–3 days)
- [ ] **M4** — Guarantee recalc on every mutation path; schedule `backfill.ts` reconciliation; log recalc failures.
- [ ] **M5** — Central `validatePassword()` used in all four account routes; raise minimum.
- [ ] **L1** — Make `gender` admin-only on student edit (or re-check new gender).
- [ ] **L2/L3** — Validate audit-log dates + try/catch; escape LIKE wildcards.

### Phase P3 — Governance, ops, supply chain (backlog)
- [ ] **M6/M7** — Business decisions on teacher access granularity and ijaza-granting governance (surface to the halaqa owner).
- [ ] **L4** — `npm audit fix`; bump `lucide-react`; add Trivy + Dependabot to CI (per `tech-strategy.md`).
- [ ] **L5** — Rate-limit/queue PDF generation; serverless-safe Chromium.
- [ ] **L6** — Confirm cookie `SameSite`; add CSRF/origin checks to state-changing routes.

### Quality gates (every phase)
`.claude/rules/code-quality.md`: tests pass · lint passes · `npm run build` (typecheck) succeeds · `npm audit` clean of runtime-impacting advisories. Per Core Directive 3, each bug fix lands with a regression test that fails without the fix.

---

## 8. Appendix

**`npm audit` runtime-impacting summary:** `next` HIGH (proxy bypass, SSRF, DoS, endpoint disclosure) → fix `next@16.3.3+`. Transitive/dev-only HIGH/moderate: `brace-expansion`, `js-yaml`, `nanoid`, `postcss`, `esbuild` (via eslint/drizzle-kit/next).

**Files reviewed (first-hand):** all `src/app/api/**` routes (students, students/[id], students/[id]/{progress,review,attendance,sessions}, sessions, sessions/[id], ijazat, ijazat/[id], admins, admins/[id], teachers, teachers/[id], audit-logs, auth/me, reports/parent-report, surahs); `src/infrastructure/auth/{proxy,server,admin,config}.ts`; `src/proxy.ts`; `src/features/auth/{api-context,session,student-access,shared,actions}.ts`; `src/features/audit/audit-log.ts`; `src/features/students/server/recalc.ts`; `src/db/{client,schema}.ts`; `next.config.js`; `.gitignore`; `supabase/legacy/{rls.sql,README.md}`; `drizzle/migrations/*`; `package.json`.

**Not exhaustively verified (lower-risk, GET-only or pure):** `students/[id]/{attendance,sessions}` handlers, `reports/students-stats`, and the `domain/*` pure functions were reviewed for shape via their callers and CLAUDE.md rather than line-by-line; they are unit-tested and I/O-free. No dynamic testing (DAST) or live-DB penetration testing was performed — this is a static review.
