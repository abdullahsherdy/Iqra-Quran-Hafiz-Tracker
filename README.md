# اقرأ (Iqra) — Quran Memorization Tracker

تطبيق متابعة حلقة تحفيظ القرآن الكريم.

## Getting Started

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase keys
npm run dev
```

Open http://localhost:3000 — you'll be redirected to the login page.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4** + **shadcn/ui** components
- **Supabase** (Postgres, Auth, RLS)
- **Cairo** font (Arabic RTL)

## Project Structure

```
src/
  app/
    (auth)/login/         — login page
    (admin)/admin/        — admin routes (dashboard, students, teachers, ...)
    (teacher)/teacher/    — teacher routes (dashboard, students, sessions, ...)
    layout.tsx            — root layout (RTL, Cairo font)
    globals.css           — theme tokens + palette
  components/
    ui/                   — shadcn/ui base components
    app-shell.tsx         — sidebar + topbar + mobile nav
    badges.tsx            — domain badges (rating, session type, gender, attendance)
    page-placeholder.tsx  — placeholder for pages under construction
  lib/
    nav.ts                — navigation config per role
    utils.ts              — cn() helper
docs/
  Quran-hafiz-tracker-design.md   — full design document
  plans/                          — implementation plans (01–08)
```

## Implementation Plans

See `docs/plans/00-overview.md` for the full build plan.

## Adding shadcn/ui Components

```bash
npx shadcn@latest add dialog select tabs table tooltip dropdown-menu
```
