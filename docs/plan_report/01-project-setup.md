# Plan 01 — Implementation Report

**Plan:** 01 — Project Setup (Foundation)
**Status:** ✅ Complete (with post-completion fix)
**Build:** `npm run build` passes with no errors
**Date:** 2026-06-29
**Fixed:** 2026-06-29

---

## Tasks Completed

### 1. Scaffold Next.js App ✅
- Next.js 16.2.9 with TypeScript, App Router, Tailwind CSS v4, ESLint, `src/` directory
- Project named `iqra` in `package.json`
- Scaffolded in temp folder then moved to repo root (root dir was non-empty)

### 2. RTL + Cairo Font ✅
- Root layout (`src/app/layout.tsx`): `<html lang="ar" dir="rtl">`, Cairo font via `next/font/google` with `--font-cairo` variable
- `globals.css`: `direction: rtl`, `color-scheme: light`, Cairo as `--font-sans`
- App metadata: title from `NEXT_PUBLIC_APP_NAME` (default "اقرأ"), Arabic description
- Light-only (no dark mode) per design

### 3. shadcn/ui Base Components ✅
- `components.json` configured for manual component addition
- Manually created (terminal couldn't run interactive `shadcn init`):
  - `src/components/ui/button.tsx` — Button with variants (default, destructive, outline, secondary, ghost, link) and sizes (default, sm, lg, icon), `asChild` via `@radix-ui/react-slot`
  - `src/components/ui/card.tsx` — Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
  - `src/components/ui/badge.tsx` — Badge with default/secondary/destructive/outline variants
  - `src/components/ui/input.tsx` — Input with focus ring, RTL-friendly
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- Installed: `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `@radix-ui/react-slot`

### 4. Color Palette + Badge Helpers ✅
- `globals.css` has all §8.3 tokens as CSS variables + `@theme inline` mappings:
  - Primary: `#1A6B3C` (Islamic green), primary-hover: `#145530`
  - Semantic: background, foreground, card, muted, accent, destructive, border, input, ring
  - Radius scale
- `src/components/badges.tsx` — Domain-specific badges with exact Arabic labels and §8.5 colors:
  - `RatingBadge`: ممتاز (green), جيد (yellow), ضعيف (red)
  - `SessionTypeBadge`: حفظ جديد (blue), مراجعة (purple), تسميع (teal)
  - `GenderBadge`: ذكر (blue), أنثى (pink)
  - `AttendanceBadge`: حاضر (green), غائب (red), متأخر (yellow)

### 5. Role-Aware App Shell ✅
- `src/lib/nav.ts` — Navigation config with `NavItem` type, admin/teacher item lists, `getNavItems(role)` helper, `adminOnly` flag
- `src/components/app-shell.tsx` — Full shell:
  - Desktop sidebar (240px, right side in RTL) with app logo + name, nav links, username, logout
  - Topbar showing active page title
  - Mobile bottom nav with icons + truncated labels
  - Active link highlighting via `usePathname()`
  - Takes `role` prop ("admin" | "teacher") and `username` prop
- `src/components/page-placeholder.tsx` — Reusable placeholder showing Arabic title + "قيد الإنشاء"

### 6. Placeholder Routes ✅
- **Auth:** `(auth)/login` — login form with Input + Button, centered card layout
- **Admin** (`(admin)/admin/`):
  - `/admin` → لوحة التحكم
  - `/admin/students` → الطلاب
  - `/admin/teachers` → المحفظون
  - `/admin/assignments` → إسناد الطلاب
  - `/admin/ijazat` → الإجازات
  - `/admin/reports` → التقارير
- **Teacher** (`(teacher)/teacher/`):
  - `/teacher` → لوحتي
  - `/teacher/students` → الطلاب
  - `/teacher/session/new` → تسجيل جلسة
  - `/teacher/attendance` → الحضور
  - `/teacher/reports` → التقارير
- `/` redirects to `/login`
- Note: `/teacher/ijazat/new` from plan was not created (ijazat creation is admin-initiated per design; can add later if needed)

### 7. Environment + README ✅
- `.env.local.example` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_EMAIL_DOMAIN`, `NEXT_PUBLIC_APP_NAME=اقرأ`
- `README.md` — setup instructions, tech stack, project structure, shadcn component guide

---

## Deviations from Plan

| Plan item | What happened | Reason |
|---|---|---|
| `npx shadcn@latest init` + add all components | Manual component creation | Terminal couldn't run interactive CLI |
| Add `select`, `dialog`, `table`, `toast/sonner`, `tabs`, `dropdown-menu`, `tooltip` | Only added `button`, `card`, `badge`, `input` | These are needed in later plans; will add per-plan when required |
| `/teacher/ijazat/new` route | Not created | Ijazat are admin-initiated per design §4; teacher can view but not create |
| Rating/session/gender/attendance color tokens in `@theme` | Colors are inline in `badges.tsx` instead of CSS variables | Simpler for now; can extract to tokens if reused elsewhere |
| Tailwind CSS v4 styles applied | **Bug fixed post-completion** — `@import "tailwindcss";` was missing from `globals.css`; all pages rendered as plain HTML with no styles. Fixed by prepending the import. | Tailwind v4 requires an explicit CSS-first import unlike v3 |

---

## Files Created/Modified

**Created:**
- `src/lib/nav.ts`
- `src/lib/utils.ts`
- `src/components/app-shell.tsx`
- `src/components/page-placeholder.tsx`
- `src/components/badges.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/input.tsx`
- `src/app/(auth)/login/layout.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(admin)/admin/layout.tsx`
- `src/app/(admin)/admin/page.tsx`
- `src/app/(admin)/admin/students/page.tsx`
- `src/app/(admin)/admin/teachers/page.tsx`
- `src/app/(admin)/admin/assignments/page.tsx`
- `src/app/(admin)/admin/ijazat/page.tsx`
- `src/app/(admin)/admin/reports/page.tsx`
- `src/app/(teacher)/teacher/layout.tsx`
- `src/app/(teacher)/teacher/page.tsx`
- `src/app/(teacher)/teacher/students/page.tsx`
- `src/app/(teacher)/teacher/session/new/page.tsx`
- `src/app/(teacher)/teacher/attendance/page.tsx`
- `src/app/(teacher)/teacher/reports/page.tsx`
- `components.json`
- `.env.local.example`
- `README.md`

**Modified:**
- `src/app/layout.tsx` — RTL, Cairo font, Arabic metadata
- `src/app/globals.css` — full palette tokens, RTL base styles; **later fixed**: added `@import "tailwindcss";` at top
- `src/app/page.tsx` — redirect to `/login`
- `package.json` — renamed to `iqra`

**Removed:**
- Default scaffold page content, `favicon.ico`, scaffold `CLAUDE.md`

---

## Acceptance Criteria Check

- [x] `npm run dev` runs with no errors; page renders right-to-left in Arabic
- [x] Cairo font is visibly applied; green primary color on active nav item *(required Tailwind import fix)*
- [x] Sidebar shows correct items for hard-coded `role` prop; mobile shows bottom nav *(required Tailwind import fix)*
- [x] All placeholder routes load and show their Arabic titles
- [x] Badge helper components render with correct colors from §8.5
- [x] `npm run build` passes

---

## Notes for Plan 02

- Auth is not wired — login form is UI-only, no Supabase connection yet
- `role` and `username` are hard-coded in admin/teacher layouts
- Remaining shadcn components (`select`, `dialog`, `table`, `tabs`, `tooltip`, `dropdown-menu`, `sonner`) will be added as needed in subsequent plans
- Route groups `(admin)`, `(auth)`, `(teacher)` keep layouts isolated — auth layout is bare (no shell), admin/teacher layouts wrap content in `AppShell`
