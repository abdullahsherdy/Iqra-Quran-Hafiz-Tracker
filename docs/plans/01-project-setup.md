# Plan 01 — Project Setup (Foundation)

**Goal:** A running Next.js app with Arabic RTL, the Cairo font, Tailwind + shadcn/ui, the app
name اقرأ, and an empty role-aware shell layout (sidebar + topbar). No data yet.

**Depends on:** none.

**Design references:** §2 (stack), §8 (UI/UX), §8.0 (UX principles), §8.2 (typography),
§8.3 (colors), §8.4 (navigation).

## YOUR ACTIONS (manual)
- None for this plan. (You will need Node.js 18+ installed.)

## Tasks
1. Create the app: `npx create-next-app@latest iqra --ts --app --tailwind --eslint`.
   Use the App Router and `src/` directory.
2. Configure global RTL + Arabic:
   - In the root layout set `<html lang="ar" dir="rtl">`.
   - Load **Cairo** via `next/font/google` and apply it to `<body>`.
3. Install and init **shadcn/ui** (`npx shadcn@latest init`); set the base color to neutral and
   confirm RTL works. Add these components now: `button`, `input`, `select`, `dialog`, `table`,
   `badge`, `toast`/`sonner`, `tabs`, `card`, `dropdown-menu`, `tooltip`.
4. Add the **color palette** from §8.3 as Tailwind theme tokens (primary `#1A6B3C`, rating /
   session / gender / juz colors). Create small helper components for the badges in §8.5
   (rating badge, session-type badge, gender badge, attendance status badge).
5. Build the **app shell** (not wired to auth yet):
   - Right-side sidebar (240px) with the nav items from §8.4. Header shows "📖 اقرأ".
   - The sidebar takes a `role` prop (`'admin' | 'teacher'`) and hides admin-only items.
   - Mobile: collapses to a bottom nav bar (§8.7).
   - A topbar with the current page title and the logged-in user placeholder.
6. Create placeholder route groups and empty pages so navigation works:
   - `/(auth)/login`
   - `/admin`, `/admin/students`, `/admin/teachers`, `/admin/assignments`, `/admin/reports`,
     `/admin/ijazat`
   - `/teacher`, `/teacher/students`, `/teacher/session/new`, `/teacher/attendance`,
     `/teacher/reports`, `/teacher/ijazat/new`
   (Full route list in §5.) Each page renders just its Arabic title for now.
7. Add `.env.local.example` listing the variables from §10.3 (no real values yet).
8. Add a short `README.md`: how to run (`npm run dev`), and a pointer to `docs/plans/`.

## Acceptance criteria
- `npm run dev` runs with no errors; the page renders right-to-left in Arabic.
- Cairo font is visibly applied; the green primary color is used on the active nav item.
- Sidebar shows the correct items for a hard-coded `role` prop; mobile shows a bottom nav.
- All placeholder routes load and show their Arabic titles.
- The badge helper components render with the correct colors from §8.5.

## Notes for the implementer
- Keep components small and typed. Do not add backend logic in this plan.
- Do not invent data models here — that is Plan 02.
