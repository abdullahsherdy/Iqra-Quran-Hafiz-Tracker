# Iqra (اقرأ) — Multi-Tenant SaaS Scaling Plan

**Date:** 2026-08-27
**Author perspective:** architect.
**Scope:** how to evolve Iqra from a **single-halaqa** app into a **multi-tenant SaaS** where many independent halaqat/academies each get isolated data, users, billing, and configuration.
**Decision requested by the user:** *compare all three isolation models*, then recommend one and give a detailed migration plan.

> **Prerequisite:** this plan assumes the **Critical and High findings in `2026-08-27-security-audit.md` are fixed first** (esp. C1 dead-table delete, H2/M3 transactions, H4 TLS). Multi-tenancy multiplies the blast radius of every one of those bugs. **Do not begin the tenancy migration on top of the current broken delete paths.**

---

## 1. Where we are today (single-tenant reality)

- **No tenant concept exists.** There is no `tenant_id`, `org_id`, or `academy_id` on any table. Every `students`, `sessions`, `users`, `ijazat` row belongs to one implicit halaqa.
- **Authorization is 100% in application code** (Drizzle bypasses RLS; the RLS file is stale — audit M1). The scoping that *does* exist is by **role** and **gender**, not by organization.
- **Auth namespace is global.** `users.username` is globally UNIQUE and maps to a synthetic email `<username>@<AUTH_EMAIL_DOMAIN>`. Two academies could not both have a teacher named `ahmed`.
- **Reference data is shared and static** (`surahs`, `juz_boundaries`, `juz_pages`) — this is genuinely global and should stay shared in every model.

**Implication:** multi-tenancy is a cross-cutting change touching the schema, every data query, auth, onboarding, and billing. The cost differs enormously by isolation model — hence the comparison below.

---

## 2. The three isolation models

| | **A. Shared DB + `tenant_id`** | **B. Schema-per-tenant** | **C. Database-per-tenant** |
|---|---|---|---|
| **Shape** | One DB, one set of tables, every tenant row tagged with `tenant_id` | One DB, one Postgres `schema` per tenant (`tenant_abc.students`) | One physical database (or Supabase project) per tenant |
| **Isolation strength** | Logical only — a query bug leaks cross-tenant | Strong-ish — search_path separates, but one role can cross schemas | Strongest — physical separation |
| **Blast radius of a query bug** | 🔴 All tenants | 🟡 Usually one, unless search_path misused | 🟢 One tenant |
| **RLS fit** | 🟢 Excellent — `tenant_id = current_setting('app.tenant')` | 🟡 Possible but redundant with schema | 🟢 N/A (physical) |
| **Onboarding a tenant** | 🟢 Insert a row | 🟡 `CREATE SCHEMA` + run all migrations | 🔴 Provision a DB/project + migrate + seed |
| **Migrations** | 🟢 Run once | 🔴 Run × N schemas (and keep them in lockstep) | 🔴 Run × N databases (fleet migration tooling required) |
| **Noisy-neighbor / perf** | 🟡 Shared pool; need indexes on `tenant_id` | 🟡 Shared pool | 🟢 Isolated resources |
| **Cross-tenant analytics** | 🟢 Trivial (`GROUP BY tenant_id`) | 🔴 Cross-schema union | 🔴 Cross-DB aggregation pipeline |
| **Cost per tenant** | 🟢 Marginal | 🟡 Low–moderate (catalog bloat at 1000s of schemas) | 🔴 High (idle DB per tenant) |
| **Per-tenant restore / delete** | 🔴 Filtered export/delete | 🟡 `pg_dump --schema` / `DROP SCHEMA` | 🟢 Restore/drop the DB |
| **Data residency (per-tenant region)** | 🔴 Hard | 🟡 Hard | 🟢 Natural |
| **Connection-pool pressure** | 🟢 One pool | 🟡 One pool | 🔴 N pools / N Supabase clients |
| **Code change size** | 🟡 Add `tenant_id` to every query + RLS | 🔴 Dynamic `search_path` per request + connection routing | 🔴 Dynamic connection selection + secrets per tenant |
| **Fits current stack (Supabase + Drizzle + `pg`)** | 🟢 Yes, directly | 🟡 Awkward (Drizzle schema switching, migration fan-out) | 🔴 Requires provisioning automation + Supabase project mgmt |
| **Best for** | Many small/medium tenants (our case: halaqat) | Mid-market, moderate tenant count, stronger isolation | Enterprise, compliance/residency, few large tenants |

### When each model wins
- **A (shared + `tenant_id`)** — the SaaS default. Best economics and operational simplicity for **many small tenants**. Its one real weakness (logical-only isolation) is directly mitigated by **RLS as a hard boundary**.
- **B (schema-per-tenant)** — a middle ground when tenants demand stronger isolation or per-tenant schema variation, and the count stays in the hundreds, not tens of thousands. Migration fan-out is the ongoing tax.
- **C (DB-per-tenant)** — reach for it only under **compliance/data-residency** mandates, per-tenant scaling needs, or a small number of large, high-value enterprise tenants. Expensive and operationally heavy.

---

## 3. Recommendation: **Model A — shared DB + `tenant_id`, with RLS as the enforced boundary**

**Why A for Iqra:**
1. **Tenant profile fits.** Halaqat/academies are numerous and individually small (dozens–hundreds of students). Model A's economics and one-shot migrations are ideal; C's per-DB overhead would dominate.
2. **Least deviation from the current stack.** Supabase + Drizzle + `pg` already runs this shape. B and C need connection/schema routing the codebase has no scaffolding for.
3. **Cross-tenant product analytics stay trivial** — valuable for a SaaS operator (usage, billing, health).
4. **The isolation weakness is fixable — and fixing it repays an existing debt.** Model A leaks only if a query forgets its `tenant_id` filter. **RLS turns that from a data breach into a no-op.** The audit already flags that RLS is not currently the boundary (M1); adopting A is the forcing function to make RLS *real*.

**The core architectural shift:** today the Drizzle `postgres` role **bypasses RLS** and all scoping is in code. For multi-tenancy, **RLS must become a true second line of defense** so a single missing `WHERE tenant_id = ?` cannot cross tenants.

### Two viable enforcement mechanisms (pick per operation)

| Mechanism | How | Use for |
|---|---|---|
| **Per-request GUC + RLS (recommended default)** | Set `app.current_tenant` on the connection each request (`SET LOCAL app.current_tenant = $tenantId` inside a transaction), and write RLS policies `USING (tenant_id = current_setting('app.current_tenant')::uuid)`. Run app queries as a **non-BYPASSRLS role**. | All normal tenant-scoped reads/writes. |
| **App-code filter (defense-in-depth)** | Keep an explicit `eq(table.tenant_id, ctx.tenantId)` in every Drizzle query too. | Belt-and-suspenders; also required for the platform/admin role that legitimately crosses tenants. |

> **Key constraint with the pooler:** Supavisor **transaction** pooling does not guarantee session persistence across statements, so `SET` (session-level) is unreliable. Use **`SET LOCAL` inside an explicit transaction** (Drizzle `db.transaction(...)`), which scopes the GUC to that transaction on that connection. Validate this against the pooler early (see Phase 0 spike) — if it proves flaky, fall back to a dedicated non-pooled connection for tenant-scoped work, or the app-filter mechanism as the primary and RLS as audit-only.

---

## 4. Target architecture (Model A)

```
                         ┌─────────────────────────────────────────┐
  acme.iqra.app  ───────►│  Edge proxy (src/proxy.ts)              │
  noor.iqra.app  ───────►│  • resolve tenant from subdomain/header │
                         │  • resolve session (Supabase)           │
                         │• assert user.tenant_id == request tenant│
                         └───────────────┬─────────────────────────┘
                                         │ tenantId + userId in request ctx
                         ┌───────────────▼───────────────────────────────────┐
                         │              API routes / RSC                     │
                         │  getApiContext() → { db, appUser, tenantId }      │
                         │  db.transaction: SET LOCAL app.current_tenant     │
                         └───────────────┬───────────────────────────────────┘
                                         │  non-BYPASSRLS role
                         ┌───────────────▼─────────────────────────┐
                         │  Postgres (Supabase)                    │
                         │  RLS: tenant_id = current_setting(...)  │
                         │  tenants, users, students, sessions, ...│
                         │shared: surahs, juz_boundaries, juz_pages│
                         └─────────────────────────────────────────┘
```

### New tables
```sql
-- The tenant registry (platform-level)
CREATE TABLE tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,                 -- Arabic display name
  slug         text NOT NULL UNIQUE,          -- subdomain: acme.iqra.app
  status       text NOT NULL DEFAULT 'active' -- active | suspended | trial | cancelled
                 CHECK (status IN ('active','suspended','trial','cancelled')),
  plan         text NOT NULL DEFAULT 'trial'  -- trial | basic | pro
                 CHECK (plan IN ('trial','basic','pro')),
  settings     jsonb NOT NULL DEFAULT '{}',   -- per-tenant config (see §7)
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Optional: platform operators (SaaS staff), distinct from tenant users
CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY,   -- Supabase auth id
  email   text NOT NULL
);
```

### Tenant-scoped tables
Add `tenant_id uuid NOT NULL REFERENCES tenants(id)` to: `users`, `students`, `sessions`, `session_items`*, `attendance`, `ijazat`, `initial_memorization`, `audit_logs`.

\* `session_items` can either carry `tenant_id` (denormalized, simpler RLS) or rely on its FK to `sessions`. **Recommendation: denormalize `tenant_id` onto every scoped table** — uniform RLS policies, and no join needed to evaluate them.

**Stays global (no `tenant_id`):** `surahs`, `juz_boundaries`, `juz_pages`, `tenants`, `platform_admins`.

### Indexing
Every scoped table gets `tenant_id` as the **leading column** of its hot indexes, e.g.:
```sql
CREATE INDEX idx_students_tenant        ON students(tenant_id);
CREATE INDEX idx_sessions_tenant_date   ON sessions(tenant_id, session_date);
CREATE INDEX idx_students_tenant_status ON students(tenant_id, status);
```
Rebuild existing composite indexes to be tenant-first. This keeps every query pruning to one tenant's slice first.

### Uniqueness changes (breaking)
- `users.username`: global UNIQUE → **UNIQUE (`tenant_id`, `username`)**.
- Synthetic email must become tenant-unique: `usernameToEmail()` → `<username>@<tenant-slug>.<AUTH_EMAIL_DOMAIN>` (or `<username>+<tenant-slug>@…`). **Supabase Auth emails are global**, so the tenant component in the local part/subdomain is mandatory to avoid collisions.
- `initial_memorization` UNIQUE(`student_id`,`juz_number`) is already tenant-safe via `student_id`, but add `tenant_id` for RLS uniformity.

---

## 5. RLS policy pattern (the real boundary)

```sql
-- Run app queries as a role WITHOUT BYPASSRLS (new: app_rls role), not `postgres`.
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_students ON students
  USING     (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
-- repeat for every scoped table
```
- `current_setting('app.current_tenant', true)` — the `true` makes it return NULL instead of erroring when unset; a NULL comparison yields no rows (**fail-closed**), which is what we want.
- **Platform/cross-tenant work** (analytics, support tooling) uses a separate connection with the BYPASSRLS role, used *only* in explicitly platform-scoped code paths, never in tenant request handlers.

**Per-request wiring (Drizzle):**
```ts
// features/auth/api-context.ts (multi-tenant version, sketch)
export async function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_tenant = ${tenantId}`);
    return fn(tx);
  });
}
```
Every tenant-scoped handler runs its queries inside `withTenant(...)`. Combined with the retained in-code `eq(table.tenant_id, ...)` filters, a single forgotten filter is caught by RLS, and a single RLS misconfiguration is caught by the filter.

---

## 6. Tenant resolution & routing

**Subdomain-per-tenant** (recommended UX): `acme.iqra.app`, `noor.iqra.app`.
- Wildcard DNS `*.iqra.app` → the app; TLS via wildcard cert or per-host (Cloudflare/host-managed).
- The **edge proxy** (`src/proxy.ts` → `updateSupabaseSession`) resolves the tenant from the `Host` header's subdomain, looks up `tenants.slug` (the proxy already does one Supabase `.from("users")` lookup — extend it to also resolve the tenant), and injects `x-tenant-id` into the request context. It then asserts the authenticated user's `tenant_id` matches the requested tenant → else redirect/deny (prevents a logged-in user of tenant A from poking tenant B's subdomain).
- Alternatives: **path-based** (`/t/acme/...`) — simpler DNS/TLS, uglier URLs; or **custom domains** per tenant (later, enterprise).

**Login flow changes:** the login page is tenant-scoped by subdomain, so username uniqueness only needs to hold within the tenant, and `usernameToEmail()` includes the tenant slug (see §4).

---

## 7. Per-tenant configuration

Store in `tenants.settings jsonb`, read once per request into context. Candidates already implicit in the app:
- `app_name` (currently `NEXT_PUBLIC_APP_NAME` — becomes per-tenant).
- `auth_email_domain` (currently `AUTH_EMAIL_DOMAIN`).
- Branding (logo, primary color), locale defaults, timezone (currently hard-coded `Africa/Cairo` in `todayDateString()` — must become per-tenant config).
- Feature flags per plan (e.g. PDF reports on `pro` only).
- Review-rule tuning (the 1/7/30-day constants in `domain/review.ts`) if tenants want custom schedules.

> **Refactor note:** `todayDateString()` hard-codes `Africa/Cairo`. Multi-tenant means per-tenant timezones — thread a timezone through from tenant settings rather than a module constant. This touches attendance "today" rollover and session date validation.

---

## 8. Migration plan (phased, reversible)

### Phase 0 — Prerequisites & spike (before any schema change)
- [ ] Land all **Critical/High** security fixes from the audit (C1, H2, H3, H4, and M1's RLS cleanup).
- [ ] **Spike the pooler + `SET LOCAL` + RLS** mechanism on a throwaway branch/table. Confirm `current_setting('app.current_tenant')` survives within a Drizzle transaction over Supavisor transaction pooling. Decide the enforcement mechanism (GUC-RLS vs app-filter-primary) based on the result. **This gate de-risks the whole plan.**
- [ ] Create the non-BYPASSRLS `app_rls` DB role; keep `postgres`/BYPASSRLS for platform + migrations only.

### Phase 1 — Schema: introduce tenancy (additive, nullable first)
- [ ] Add `tenants` + `platform_admins` tables (`schema.ts` → `db:generate`).
- [ ] Add `tenant_id uuid NULL` to every scoped table (nullable during transition).
- [ ] Create a **default tenant** row representing the current halaqa.
- [ ] Backfill: `UPDATE <table> SET tenant_id = '<default-tenant-id>' WHERE tenant_id IS NULL` for every scoped table (in a transaction, table by table).
- [ ] Add tenant-first indexes.
- [ ] Flip `tenant_id` to `NOT NULL` once backfill verified (`SELECT count(*) ... WHERE tenant_id IS NULL` = 0 everywhere).

### Phase 2 — Auth namespace
- [ ] Change `users` uniqueness to UNIQUE(`tenant_id`,`username`).
- [ ] Update `usernameToEmail()` to include tenant slug; migrate existing auth users' emails (Supabase admin API) or grandfather the default tenant on the old domain.
- [ ] Update `loginAction` and the proxy to resolve tenant → scope the user lookup by `tenant_id`.

### Phase 3 — Application plumbing
- [ ] Extend request context: `getApiContext()` returns `tenantId`; resolve it in the proxy from subdomain and pass via header.
- [ ] Wrap every tenant-scoped query in `withTenant(db, tenantId, tx => ...)` **and** add explicit `eq(table.tenant_id, tenantId)` filters. Do this feature-by-feature: students → sessions → ijazat → attendance → reports → audit.
- [ ] Set `INSERT`s to stamp `tenant_id` from context (never from client input).
- [ ] Update `recalculateStudentSummary` / attendance recalc to be tenant-scoped.
- [ ] Add regression tests: a tenant-A caller must get 0 rows / 403 for tenant-B ids (pure-function tests for the scoping helper + integration tests hitting RLS).

### Phase 4 — Enforce RLS as boundary
- [ ] Author RLS policies for all scoped tables (§5). `ENABLE` + `FORCE`.
- [ ] Switch the app's runtime connection to the `app_rls` role.
- [ ] Verify: with `app.current_tenant` unset, queries return 0 rows (fail-closed). With it set, only that tenant's rows appear. Attempt a deliberate cross-tenant query in a test and confirm RLS blocks it.
- [ ] Keep the app-code filters (defense in depth) — do **not** remove them.

### Phase 5 — Onboarding, billing, platform admin
- [ ] Self-serve or operator-driven **tenant creation**: create `tenants` row → seed nothing per-tenant (reference data is shared) → create the tenant's first admin user.
- [ ] **Subdomain routing** live (wildcard DNS + TLS).
- [ ] **Billing** (Stripe): map `tenants.plan`/`status` to subscription state via webhooks; gate features by plan; handle `suspended` (read-only or blocked) in the proxy.
- [ ] **Platform admin console** (super-super-admin): list tenants, suspend, impersonate-for-support (audited), cross-tenant usage dashboards (BYPASSRLS connection, platform code only).
- [ ] Per-tenant data export/delete (GDPR-style) — filtered by `tenant_id`.

### Phase 6 — Hardening & scale
- [ ] Load-test with representative tenant counts; verify tenant-first indexes prune well (`EXPLAIN` shows index scans partitioned by tenant).
- [ ] Add per-tenant rate limiting (extends audit H3's rate-limiting work with a tenant dimension).
- [ ] Monitoring/alerting per tenant (error rates, usage), noisy-neighbor watch on the shared pool.
- [ ] Document the tenant lifecycle (trial → active → suspended → cancelled → purged).

---

## 9. Scaling stages (how far Model A carries you)

| Stage | Tenants | Move |
|---|---|---|
| **Launch** | 1–50 | Model A on a single Supabase project + pooler. Tenant-first indexes. |
| **Growth** | 50–1,000 | Read replicas for reports/analytics; connection-pool tuning; cache tenant settings; consider table partitioning by `tenant_id` (hash/list) on the largest tables (`sessions`, `session_items`). |
| **Scale** | 1,000–10,000+ | Partition hot tables by `tenant_id`; shard the largest/most-active tenants onto their own DB (**selective Model C for whales** — the RLS + `tenant_id` design lets you lift one tenant out without rearchitecting). Move analytics to a warehouse (ELT by `tenant_id`). |
| **Enterprise** | special cases | Offer **dedicated DB / region** (Model C) as a premium tier for compliance/residency; keep everyone else on A. Custom domains. |

**The design's payoff:** starting with A + RLS + `tenant_id` doesn't paint you into a corner — the same `tenant_id` key is exactly what you'd use to *extract* a tenant into schema-per-tenant (B) or DB-per-tenant (C) later. You buy simplicity now and keep the escape hatch.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **A single missing `tenant_id` filter leaks data** | RLS as hard boundary (fail-closed) + retained app-code filters + cross-tenant regression tests. This is the whole reason RLS is non-negotiable here. |
| **Pooler breaks `SET LOCAL`/GUC** | Phase 0 spike gates the approach; fallback to app-filter-primary + non-pooled tenant connections. |
| **Supabase Auth global email collisions** | Tenant slug baked into synthetic email; UNIQUE(tenant_id, username) app-side. |
| **Migration corrupts data mid-flight** | Additive nullable→backfill→NOT NULL sequence; every step in a transaction; verify counts before each flip; run on a staging clone first. |
| **Hard-coded `Africa/Cairo` / `NEXT_PUBLIC_APP_NAME`** | Move to `tenants.settings`; thread through context. |
| **Noisy neighbor on shared pool** | Per-tenant rate limits; monitoring; partitioning; whale extraction at Scale stage. |
| **Building tenancy on today's broken deletes (C1)** | Hard prerequisite: fix audit Critical/High first (Phase 0). |
| **Platform BYPASSRLS role misused in request path** | Lint/review rule: BYPASSRLS connection importable only from `platform/` code; tenant handlers use `app_rls` role exclusively. |

---

## 11. Executive summary

- **Recommended model: A — shared database + `tenant_id`, with RLS promoted to a real enforcement boundary.** It fits Iqra's many-small-tenants profile, deviates least from the current Supabase + Drizzle + `pg` stack, keeps cross-tenant analytics trivial, and — critically — its only weakness (logical isolation) is closed by RLS, which the app *should* have as defense-in-depth regardless (audit M1).
- **Non-negotiable sequencing:** fix the audit's Critical/High items **first**; then spike the pooler+RLS mechanism (Phase 0) before touching the schema.
- **Migration is additive and reversible:** add `tenant_id` nullable → backfill to a default tenant → enforce NOT NULL → wire per-request tenant context → enable RLS as the boundary → build onboarding/billing/subdomains.
- **It scales gracefully:** Model A carries you to thousands of tenants; the same `tenant_id` design lets you extract whales to dedicated schemas/DBs (B/C) later without rearchitecting. Reserve DB-per-tenant for compliance/residency premium tiers.
