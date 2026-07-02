# اقرأ (Iqra) — Implementation Plans Index

This folder splits the full design (`../Quran-hafiz-tracker-design.md`) into small, ordered
plans. Each plan is self-contained and sized so a smaller/weaker coding model can implement it
correctly in one focused session.

## How to use these plans
- Do the plans **in order** (01 → 08). Each plan lists the plans it depends on.
- Each plan has a **"YOUR ACTIONS (manual)"** section — steps only YOU (the human) can do,
  such as creating accounts or pasting secret keys. Do those first when present.
- After finishing a plan, verify it against its **Acceptance Criteria** before moving on.
- The design document is the source of truth. Plans reference it by section number
  (e.g. *design §4.3*).

## Plan list
| # | Plan | What it delivers | Depends on |
|---|---|---|---|
| 01 | `01-project-setup.md` | Next.js + Tailwind + shadcn, RTL, Arabic font, base layout & nav | — |
| 02 | `02-database-and-auth.md` | Supabase project, schema, seeds, RLS, username login | 01 |
| 03 | `03-students-teachers-assignments.md` | Students/teachers CRUD, multi-teacher assignment, gender scoping, list filters | 02 |
| 04 | `04-sessions-attendance.md` | Session recording + daily attendance | 03 |
| 05 | `05-progress-ijazat.md` | Quran progress map, ijazat, summary recalculation | 04 |
| 06 | `06-reports.md` | PDF report + WhatsApp text export | 05 |
| 07 | `07-dashboards.md` | Admin dashboard (stats/alerts) + teacher dashboard | 05 |
| 08 | `08-backup-polish-deploy.md` | Data backup/export, UX polish, mobile, deploy to Vercel | 01–07 |

## Global conventions (apply to every plan)
- **Language/UI:** Arabic only, full RTL. No English visible to end users. (design §8)
- **Non-tech users:** follow the UX principles in design §8.0 on every screen.
- **App name:** اقرأ (env `NEXT_PUBLIC_APP_NAME`).
- **Stack:** Next.js 14 App Router + TypeScript, Tailwind + shadcn/ui, Supabase. (design §2)
- **Types:** type all function args/returns; avoid `any`.
- **Access rules:** enforce on the server (route handlers/server actions) AND with Supabase RLS.
  Never trust the client. (design §3, §10.2)
- **Scale:** roster will grow — all lists are paginated and filterable (design §6.1.1).

## One-time YOUR ACTIONS checklist (gathered here for convenience)
These are referenced again inside the relevant plan. You must do them yourself:
1. **Create a Supabase account + project** → see `02-database-and-auth.md`. Give the agent:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **Create the first admin auth user** in the Supabase dashboard (Auth → Users) and share its
   email/password → see `02-database-and-auth.md`.
3. **Create a GitHub repo** and **a Vercel account**, then connect them → see
   `08-backup-polish-deploy.md`. Add the same env vars in the Vercel dashboard.
4. (Optional) Provide a **mosque name/logo** for the PDF header → see `06-reports.md`.
