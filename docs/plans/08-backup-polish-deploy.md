# Plan 08 — Backup/Export, UX Polish & Deployment

**Goal:** Admin data backup/export, a final non-tech UX pass, mobile checks, and deploy to
Vercel so all laptops can use it from a browser with no installation.

**Depends on:** 01–07.

**Design references:** §6.11 (backup), §8 (UI/UX), §8.0 (UX principles), §8.7 (mobile),
§10 (deployment), §7 (`/api/admin/backup`).

## YOUR ACTIONS (manual)
1. Create a **GitHub account** (if you don't have one) and an empty repo for the project.
2. Create a **Vercel account** and connect it to that GitHub repo.
3. In the **Vercel project settings → Environment Variables**, add the same values from
   `.env.local` (§10.3): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_EMAIL_DOMAIN`, `NEXT_PUBLIC_APP_NAME=اقرأ`.
4. After deploy, **share the Vercel URL** with the teachers/laptops.
5. Decide a routine to click **"نسخ احتياطي"** (e.g. monthly) and keep the exported file safe.

## Tasks
### Backup / export (§6.11)
1. `GET /api/admin/backup` (admin only): export all tables to a single timestamped JSON file
   for download. Add a "نسخ احتياطي" button on the admin dashboard.
2. Document a manual **restore** procedure (re-import the JSON) in the README. (Automated
   restore is out of scope for v1.)

### UX polish pass (§8, §8.0)
3. Review every screen against the §8.0 principles: one clear primary action, big touch
   targets, Arabic-only labels, success toasts, loading states, friendly empty states,
   confirm-before-delete.
4. Ensure all dates/numbers render in Arabic (§8.1) and all forms follow §8.6.

### Mobile / tablet (§8.7)
5. Verify session recording and attendance are comfortable on a phone/tablet; bottom nav works;
   touch targets ≥ 44px.

### Deploy (§10.4)
6. Push to GitHub; connect to Vercel; confirm the build passes with the env vars set.
7. Smoke-test the live URL end to end: login → add student → assign teacher(s) → record
   session → progress map → report PDF → admin dashboard.

## Acceptance criteria
- Admin can download a full JSON backup; restore steps are documented.
- A non-technical teacher can complete the daily flow on a phone without guidance.
- The app is live on a Vercel URL, loads for all laptops, and the smoke test passes.
- No English text is visible to end users anywhere.

## Notes for the implementer
- Keep the backup endpoint admin-only and behind the service role on the server.
- If the Supabase free project was paused for inactivity, resuming it restores data; the
  JSON export is the extra safety net.
