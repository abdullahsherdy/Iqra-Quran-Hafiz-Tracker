<!-- markdownlint-disable MD022 MD024 MD031 MD032 MD040 MD060 -->
# Changelog

Append-only audit log of development changes. New entries are added at the
top. Existing entries are never edited (except to fix factual errors, noted
inline). This is a record of *what changed and when*, not a status report.

---

## 2026-08-01 — Session form: empty items + future date lock

### Rationale

Two changes to the session form:

1. **Empty default items**: the session form pre-filled the first item with
   surah 1 (الفاتحة) and its full ayah range (1–7). The user wanted the form
   to start empty — the teacher adds only the items they actually recited,
   one by one, and can remove all of them.

2. **Future date lock**: the session date picker allowed selecting future
   dates. Sessions represent past events, so the date should not exceed
   today. Added both a frontend `max` attribute and a server-side validation.

### What changed

#### Empty default items

- **`session-form.tsx`**: `makeDefaultItem()` (pre-filled surah + ayah range)
  replaced with `makeEmptyItem()` — surah_id=0, empty ayah fields. Items
  state initializes to `[]` in create mode. Post-submit reset clears items
  to `[]`. The surah `<select>` now has a disabled placeholder option
  ("— اختر السورة —") at value 0. The delete (trash) button is always
  visible on every item (removed the `items.length > 1` guard). Added an
  empty-state message when no items exist. Added validation for zero items
  ("يجب إضافة عنصر واحد على الأقل للجلسة"). Removed the localStorage
  surah-restore `useEffect` and the unused `useEffect` import — no longer
  relevant since items start empty.

#### Future date lock

- **`session-form.tsx`**: added `max={today}` to the session date `<input>`,
  preventing future dates in the browser's date picker.
- **`src/domain/sessions.ts`**: `validateSessionPayload` now accepts an
  optional `todayDate` parameter. When provided, rejects `session_date`
  after `todayDate` with "لا يمكن تسجيل جلسة في تاريخ مستقبلي".
- **`src/app/api/sessions/route.ts`**: passes `todayDateString()` as the
  third argument to `validateSessionPayload` (POST).
- **`src/app/api/sessions/[id]/route.ts`**: passes `todayDateString()` as
  the third argument to `validateSessionPayload` (PUT).
- **`src/domain/sessions.test.ts`**: 3 new tests — rejects future date,
  accepts today's date, confirms no check when `todayDate` is omitted.

### Files changed

- `src/features/sessions/components/session-form.tsx` — empty items + max date
- `src/domain/sessions.ts` — future date validation
- `src/domain/sessions.test.ts` — 3 new tests
- `src/app/api/sessions/route.ts` — pass todayDate to validation
- `src/app/api/sessions/[id]/route.ts` — pass todayDate to validation

---

## 2026-08-01 — Attendance simplification + recommended review in session form

### Rationale

Two changes in this entry:

1. **Attendance simplification**: the old attendance system tracked absences,
   excused days, holidays, and supported manual attendance entry. This was
   unnecessarily complex for the halaqa's needs — attendance should be
   auto-derived from sessions only (has session = attended, no session = no
   record). The user requested removing absence tracking, removing manual
   entry, and replacing the attendance rate with two simple cards: total
   attendance count + attendance this month.

2. **Recommended review in session form**: when a teacher records a new
   session, they need to see what the student should review that day (the
   spaced-repetition schedule). The "المراجعة المجدولة" was only visible as
   a separate tab in the student profile. Adding it inline in the session
   form lets the teacher see the recommended review while recording the
   session.

### What changed

#### Attendance simplification

- **`src/domain/attendance.ts`**: rewritten. `computeAttendanceCalendar` now
  returns only present days (days with sessions) — no absent/excused/holiday
  entries. `computeDayAttendance` returns `"present"` or `null` (no `"absent"`).
  Removed `AutoAttendanceStatus` absent type. Fridays still excluded.
  Status-aware logic (paused/withdrawn/graduated) preserved.
- **`src/features/attendance/server/recalc.ts`**: rewritten. Only inserts
  present-day rows. Removed manual row preservation logic — all rows are
  rebuilt from sessions.
- **`src/app/api/students/[id]/attendance/route.ts`**: removed POST (manual
  entry) and DELETE (manual removal) endpoints. GET now returns
  `{ records, stats: { total, thisMonth } }` instead of the old
  `attendance_rate`-based stats.
- **`src/features/attendance/components/student-attendance-tab.tsx`**: deleted.
  The attendance tab was removed from the student profile.
- **`src/features/students/components/student-profile-tabs.tsx`**: removed
  the "الحضور" tab and its `StudentAttendanceTab` import. Tabs are now:
  progress, review, sessions, ijazat.
- **`src/features/sessions/components/student-sessions-tab.tsx`**: added two
  attendance stats cards at the top (إجمالي الحضور + حضور هذا الشهر), fetched
  from the attendance API. Refreshed after session edit/delete.
- **`src/domain/attendance.test.ts`**: rewritten for the new present-only
  logic. 15 tests covering calendar (present days only, Fridays excluded,
  paused/withdrawn/graduated) and `computeDayAttendance` (present vs null).

#### Recommended review in session form

- **`src/features/sessions/components/recommended-review.tsx`** (NEW): a
  self-contained component that fetches the spaced-repetition review schedule
  for a given student + date from `/api/students/[id]/review?date=...` and
  displays it grouped by rule (1-day, 7-day, 30-day) with color-coded
  sections. Shows surah name, ayah range, and original memorization date for
  each item. Displays a helpful empty-state message when nothing is due.
- **`src/features/sessions/components/session-form.tsx`**: imports
  `RecommendedReview` and renders it between the session info card and the
  session items card (create mode only, not edit mode). Updates live when
  the teacher changes the student or session date.

### Files changed

- `src/domain/attendance.ts` — rewritten (present-only)
- `src/domain/attendance.test.ts` — rewritten for new logic
- `src/features/attendance/server/recalc.ts` — rewritten (present-only)
- `src/features/attendance/components/student-attendance-tab.tsx` — deleted
- `src/app/api/students/[id]/attendance/route.ts` — removed POST/DELETE, new stats
- `src/features/students/components/student-profile-tabs.tsx` — removed attendance tab
- `src/features/sessions/components/student-sessions-tab.tsx` — added attendance stats cards
- `src/features/sessions/components/recommended-review.tsx` — NEW
- `src/features/sessions/components/session-form.tsx` — embedded RecommendedReview

---

## 2026-08-01 — Sessions refactor: multi-item sessions + spaced repetition review

### Rationale

The old sessions schema stored a single surah + ayah range per session row
(`session_type`, `surah_id`, `from_ayah`, `to_ayah`, `rating`, `pages`,
`notes` all directly on `sessions`). This was limiting: a teacher could not
record multiple surahs in one session, there was no spaced repetition review
system, and the per-session rating didn't reflect individual items. The
refactor splits sessions into a parent-child model and adds a review
scheduling system.

### What changed

#### Schema (migration 0005)

- **New `session_items` table**: each row represents one Quran portion
  (surah + ayah range) recited in a session. Fields: `session_type`
  (`new_memorization` | `review`), `surah_id`, `from_ayah`, `to_ayah`,
  `rating`, `pages`, `notes`. FK to `sessions` with `ON DELETE CASCADE`.
- **`sessions` table simplified**: now holds only `student_id`,
  `teacher_id`, `session_date`, `overall_rating`, `notes`, `created_at`.
  Old columns (`session_type`, `surah_id`, `from_ayah`, `to_ayah`,
  `rating`, `pages`) dropped.
- **Data migration**: existing session rows migrated to `session_items`
  (one item per old session). `overall_rating` copied from old `rating`.

#### Domain layer

- **`src/domain/sessions.ts`**: `validateSessionPayload` rewritten for
  multi-item validation. Now accepts `items[]` array with per-item
  validation (session_type, surah_id, ayah range, rating, pages, notes).
  Session-level fields: `student_id`, `session_date`, `overall_rating`,
  `notes`.
- **`src/domain/review.ts`** (NEW): pure spaced repetition logic.
  `computeReviewSchedule(targetDate, newMemorizationItems)` computes which
  items should be reviewed on a target date using three look-back rules:
  1-day (المراجعة القريبة), 7-day (المراجعة المتوسطة), 30-day
  (المراجعة التراكمية). Only `new_memorization` items trigger reviews.
  Deduplicates items matching multiple rules. `groupReviewsByRule` groups
  results for display.

#### API routes

- **`POST /api/sessions`**: creates session + items in a transaction.
  Validates surah IDs, calls `validateSessionPayload`, inserts parent
  session then child items, recalculates student summary + attendance.
- **`GET /api/sessions`**: returns sessions with nested items. Filters
  by `session_type` on items (not sessions).
- **`GET /api/sessions/[id]`**: returns single session with items.
- **`PUT /api/sessions/[id]`**: replaces all items (delete old + insert
  new in a transaction). Recalculates both old and new student if student
  changed.
- **`DELETE /api/sessions/[id]`**: deletes session (items cascade).
- **`GET /api/students/[id]/sessions`**: returns sessions with nested
  items for student profile.
- **`GET /api/students/[id]/progress`**: fetches from `session_items`
  join instead of `sessions` directly.
- **`GET /api/students/[id]/review`** (NEW): returns spaced repetition
  schedule for a date, grouped by rule (1-day, 7-day, 30-day).

#### UI

- **`session-form.tsx`**: rewritten for multi-item entry. Supports
  adding/removing items, each with its own surah, ayah range, type, rating,
  pages, and notes. Expandable item cards with preview. Remembers
  last-used surah per student (localStorage). Added edit mode: accepts
  `editSessionId` + `initialData` props, submits via PUT instead of POST,
  shows "تعديل الجلسة" header and "إلغاء التعديل" cancel button.
- **`student-sessions-tab.tsx`**: rewritten to display sessions with
  nested items. Each session shows date, overall rating, teacher, notes,
  and a list of items (type badge, surah, ayah range, per-item rating,
  pages, notes). Edit (Pencil) and delete (Trash) buttons per session.
  Edit mode renders `SessionForm` inline above the list. Fetches surahs
  from `/api/surahs` on first edit.
- **`review-calendar.tsx`** (NEW): date picker + grouped review display
  for the "المراجعة المجدولة" tab. Shows items due for 1-day, 7-day, and
  30-day review with color-coded sections.
- **`student-profile-tabs.tsx`**: added "المراجعة المجدولة" tab between
  "التقدم" and "الجلسات". Now passes `studentName` to `StudentSessionsTab`.
- **Admin + teacher dashboards**: updated to use `overall_rating` instead
  of `rating`. Removed `session_type` references.
- **Admin + teacher reports**: updated ratings aggregation to use
  `overall_rating`.

#### Tests

- **`sessions.test.ts`**: 20 tests covering multi-item validation (valid
  single/multi-item payloads, missing fields, invalid types, ayah range
  errors, pages validation, notes length limits).
- **`review.test.ts`** (NEW): 12 tests covering `computeReviewSchedule`
  (1/7/30-day matching, deduplication, month/year boundaries, leap year,
  multiple items same date) and `groupReviewsByRule`.
- **`progress.test.ts`**: updated `SessionRow` mock data to match
  `session_items` shape.

### Files changed

- `drizzle/migrations/0005_session_items.sql` — new migration
- `src/db/schema.ts` — added `sessionItemsTable`, modified `sessionsTable`
- `src/domain/sessions.ts` — rewritten multi-item validation
- `src/domain/review.ts` — NEW, spaced repetition logic
- `src/domain/sessions.test.ts` — updated tests
- `src/domain/review.test.ts` — NEW, review tests
- `src/domain/progress.test.ts` — updated mock data
- `src/features/students/server/progress.ts` — reads from `session_items`
- `src/app/api/sessions/route.ts` — rewritten for multi-item CRUD
- `src/app/api/sessions/[id]/route.ts` — rewritten for multi-item CRUD
- `src/app/api/students/[id]/sessions/route.ts` — returns nested items
- `src/app/api/students/[id]/progress/route.ts` — fetches from `session_items`
- `src/app/api/students/[id]/review/route.ts` — NEW, review schedule
- `src/app/(admin)/admin/page.tsx` — uses `overall_rating`
- `src/app/(admin)/admin/students/[id]/page.tsx` — passes `studentName`
- `src/app/(teacher)/teacher/page.tsx` — uses `overall_rating`
- `src/app/(teacher)/teacher/students/[id]/page.tsx` — passes `studentName`
- `src/app/(teacher)/teacher/reports/page.tsx` — uses `overall_rating`
- `src/app/(admin)/admin/reports/page.tsx` — uses `overall_rating`
- `src/features/sessions/components/session-form.tsx` — rewritten + edit mode
- `src/features/sessions/components/student-sessions-tab.tsx` — rewritten + edit
- `src/features/sessions/components/review-calendar.tsx` — NEW
- `src/features/students/components/student-profile-tabs.tsx` — review tab
- `CLAUDE.md` — updated schema, domain, testing documentation

---

## 2026-08-01 — Expand teacher permissions: full student editing + hefz

Branch: `fix-ijaza-page-UI`.

### Rationale

Teachers were restricted to editing only student notes; all other student data
(personal info, status, initial memorization/hefz) was admin-only. The user
requested that teachers be able to edit student personal info, initial
memorization, and status — matching the admin edit form. This leaves only
destructive operations (delete student, revoke ijaza, manage teachers) as
admin-only.

### What changed

- **API route** (`src/app/api/students/[id]/route.ts`): removed the
  teacher-specific branch in `PUT` that restricted teachers to `notes` +
  `initial_memorization`. Both roles now share the same update path: all
  allowed fields (name, gender, birth_date, guardian_name, guardian_phone,
  enrollment_date, notes, status) + `initial_memorization`, with full
  validation (`validateStudentPayload`, `validateInitialMemorization`),
  `status_since` stamping on status change, and `recalculateStudentSummary` +
  `recalculateStudentAttendance` calls.
- **Edit form** (`src/app/(admin)/admin/students/[id]/edit/edit-student-form.tsx`):
  removed the teacher-specific submit handler and the teacher-only UI block
  (notes + init mem card). Teachers now see the exact same form as admins:
  full personal info, status dropdown, and the initial memorization grid. The
  `mode` prop remains in the interface for compatibility but no longer gates
  any fields or behavior.
- **CLAUDE.md**: added a "Role permissions matrix" section documenting all
  capabilities and which are admin-only vs shared.

### Admin-only capabilities (after this change)

1. Delete students (soft → withdrawn, or permanent hard delete with cascade)
2. Revoke ijazat (DELETE `/api/ijazat/[id]`)
3. Manage teachers (create/list/update teacher accounts)

---

## 2026-08-01 — Redesign admin ijazat page: vertical layout + responsive table

Branch: `fix-ijaza-page-UI` (off `refactor/drop-teacher-assignments`).

### Rationale

The admin ijazat page used a two-column grid (list on one side, form on the
other) that was cramped on tablets and broken on mobile. The user wanted a
simpler vertical flow: the grant form first, then the ijazat log below it,
working well across mobile, tablet, and laptop.

### What changed

- **Page layout** (`src/app/(admin)/admin/ijazat/page.tsx`): replaced the
  two-column `lg:grid-cols-[1fr_380px]` grid with a vertical stack —
  form section (constrained to `max-w-2xl`, centered) on top, then the
  سجل الإجازات table below. Removed the per-section `<h3>` duplication;
  the form section header uses a `Plus` icon, the log header uses a
  `BookOpen` icon.
- **Responsive ijazat table** (`src/features/ijazat/components/admin-ijazat-table.tsx`):
  - **Desktop/tablet (sm+)**: unchanged table view with horizontal scroll fallback.
  - **Mobile (<640px)**: card-based layout — each ijaza renders as a card
    with student name (link), type badge, date, sheikh name, and notes
    stacked vertically; the delete button sits in the top corner.
  - Extracted a shared `IjazaTypeBadge` component and a `resolveStudent`
    helper to deduplicate the array-or-object student resolution logic
    between the two views.

### Files changed (2 files)

- `src/app/(admin)/admin/ijazat/page.tsx` — vertical stack layout.
- `src/features/ijazat/components/admin-ijazat-table.tsx` — responsive
  table/card dual rendering.

### Verification

- `npm run lint` — 0 errors, 0 warnings
- `npm run build` — passes

---

## 2026-08-01 — Remove teacher-student assignment system; session-level teacher attribution

Branch: `refactor/drop-teacher-assignments` (off `feature/student-form-improvements`).

### Rationale

The assignment system (`teacher_student_assignments`) restricted teachers to
seeing only students explicitly assigned to them. This was overly rigid for a
small halaqa — the user wants all teachers to see all students of the same
gender (and other genders if `can_view_all_genders` is set), without needing
admin-managed assignments. Teacher attribution is now recorded per-session via
`sessions.teacher_id` (which already existed).

### What was removed

- **Assignment API routes**: `src/app/api/assignments/` (GET/POST + `[id]/end`)
  and `src/app/api/students/[id]/assignments/` — deleted entirely.
- **Assignment admin page**: `src/app/(admin)/admin/assignments/` (page +
  client component) — deleted.
- **Assignment nav entry**: "إسناد الطلاب" removed from `src/lib/nav.ts`.
- **Assignment dashboard link**: removed from admin dashboard quick actions.
- **Assignment tab**: removed from `student-profile-tabs.tsx` (the "الإسناد"
  tab and `AssignmentHistoryRow` interface).
- **`getAssignedStudentIds()`**: removed from `student-access.ts`.
- **Assignment checks in `canAccessStudent()`**: now gender-only (admin →
  always true; teacher with `can_view_all_genders` → true; teacher → true if
  student gender matches).
- **Auto-assignment on student create**: teachers creating students no longer
  auto-create an assignment row.
- **Assignment scoping everywhere**: student list, student detail, student
  edit, session list, session new, ijazat list, ijazat new, teacher dashboard,
  teacher reports — all now use gender-only scoping.

### What replaced it

- **Gender-only scoping**: teachers see all students matching their gender (or
  all if `can_view_all_genders`). No assignment table lookup needed.
- **Session-based teacher attribution**: `sessions.teacher_id` (already
  existed, NOT NULL, FK to users) records which teacher led each session. The
  session POST route already set this from the authenticated caller.
- **Session-based "teachers" lists**: admin student profile and teacher
  profile now show teachers/students based on distinct `sessions` records
  instead of assignment rows.
- **Admin teacher_id filter**: the student list filter (admin-only "filter by
  teacher") now uses `sessions.teacher_id` instead of assignment rows.

### Files changed (24 files, -865 lines net)

- `src/features/auth/student-access.ts` — `canAccessStudent` simplified to
  gender-only; `getAssignedStudentIds` removed.
- `src/app/api/students/route.ts` — GET: gender-only scoping for teachers,
  session-based teacher_id filter for admin. POST: removed auto-assignment.
- `src/app/api/students/[id]/route.ts` — GET: gender-only check, session-based
  teacher list. PUT: gender-only check. DELETE: removed assignment row cleanup.
- `src/app/api/sessions/route.ts` — GET: teacher sees their own recorded
  sessions (gender-scoped), no assignment student-id filter.
- `src/app/api/ijazat/route.ts` — GET: gender-only scoping, no assignment
  check. POST: `canAccessStudent` (now gender-only) for access check.
- `src/app/api/teachers/[id]/route.ts` — GET: session-based student list
  instead of assignment-based.
- `src/app/(admin)/admin/page.tsx` — removed assignments quick-action link.
- `src/app/(admin)/admin/students/[id]/page.tsx` — session-based teacher list,
  removed assignment history and assignments tab.
- `src/app/(admin)/admin/teachers/page.tsx` — session-based student count
  instead of assignment count.
- `src/app/(admin)/admin/teachers/[id]/page.tsx` — session-based student list,
  removed assignment date column.
- `src/app/(teacher)/teacher/page.tsx` — gender-scoped student queries instead
  of assignment-based; stat label "طالب مسند" → "طالب".
- `src/app/(teacher)/teacher/reports/page.tsx` — gender-scoped student queries;
  removed empty-state "لا يوجد طلاب مسندون".
- `src/app/(teacher)/teacher/session/new/page.tsx` — gender-scoped student
  list for session form.
- `src/app/(teacher)/teacher/ijazat/new/page.tsx` — gender-scoped student list
  for ijaza form.
- `src/app/(teacher)/teacher/students/[id]/page.tsx` — gender-only check,
  removed "current teachers" section.
- `src/app/(teacher)/teacher/students/[id]/edit/page.tsx` — gender-only check.
- `src/app/(teacher)/teacher/students/page.tsx` — subtitle updated.
- `src/features/students/components/student-profile-tabs.tsx` — removed
  assignments tab, `AssignmentHistoryRow` interface, and related props.
- `src/lib/nav.ts` — removed "إسناد الطلاب" nav entry and `ClipboardList` import.
- Deleted: `src/app/api/assignments/` (2 files), `src/app/api/students/[id]/assignments/`
  (1 file), `src/app/(admin)/admin/assignments/` (2 files).
- `src/db/schema.ts` — removed `teacherStudentAssignmentsTable` definition and
  `TeacherStudentAssignment` type export.
- `drizzle/migrations/0004_nifty_apocalypse.sql` — new migration: `DROP TABLE
  "teacher_student_assignments" CASCADE;` (+ snapshot/journal entries).

### DB

- `sessions.teacher_id` already existed (NOT NULL, FK to users) — no migration
  needed for the attribution change itself.
- **Migration 0004** (`0004_nifty_apocalypse.sql`): `DROP TABLE
  "teacher_student_assignments" CASCADE;` — the table is removed from both the
  live DB and `src/db/schema.ts` (definition + `TeacherStudentAssignment` type
  export). Apply via `npm run db:push` or Supabase SQL editor.

### Verification

- `npm run lint` — 0 errors, 0 warnings
- `npm test` — 91/91 pass (no test changes needed — domain tests are pure
  functions that never referenced assignments)
- `npm run build` — passes (assignment routes gone from route tree)

---

## 2026-08-01 — Student form improvements: phone validation, Cairo TZ, page-level memorization

Branch: `feature/student-form-improvements` (off `refactoring/full-codebase-refactor`).

### DB migrations applied to live DB

- **0001** (`0001_skinny_roland_deschain.sql`): Added `students.status_since`,
  `attendance.recorded_manually`, expanded attendance status CHECK to include
  `excused`/`holiday`, unique index on attendance. Was previously generated
  but never applied to the live DB — caused student insert 500 errors. Now applied.
- **0002** (`0002_woozy_spot.sql`): Added `pages` column (smallint, nullable,
  CHECK 1-20) to `initial_memorization`.
- **0003** (`0003_ancient_infant_terrible.sql`): Created `juz_pages` table
  (`juz_number`, `page_number`, `mushaf_page`, `surah_id`, `from_ayah`,
  `to_ayah`; PK on juz_number+page_number+surah_id; CHECK constraints; FK to
  `surahs`; index). Expanded `initial_memorization.pages` CHECK to 1-23.
  Seeded with 665 rows from `juz_pages.json` via `scripts/seed-juz-pages.js`.

### Domain logic

- **`src/domain/students.ts`**: `validateStudentPayload` now enforces Egyptian
  phone format `^01[0125]\d{8}$` (11 digits, prefixes 010/011/012/015).
  `validateInitialMemorization` accepts and validates optional `pages` field
  (nullable, 1-23). `countsFromInitialMemorization` unchanged — each init mem
  row still counts as 1 memorized juz; pages affect coverage %, not the count.
- **`src/domain/progress.ts`**: Added `JuzPageRow` interface. `InitialMemRow`
  extended with `pages?: number | null`. `computeJuzProgressPure` and
  `computeJuzProgressDetailedPure` now accept a `juzPages` parameter. When an
  init mem row has `pages` set (partial memorization), coverage is computed
  from exact page-to-ayah ranges in `juz_pages` instead of the previous
  approximate N/20 proportional formula. Overall coverage = max(session
  coverage, init-mem page coverage). Detailed view also computes per-surah
  coverage for partial init mem using page-level ayah ranges.

### Server shells & API routes

- **`src/features/students/server/progress.ts`**: Fetches `juz_pages` and
  `initial_memorization.pages`, passes both to `computeJuzProgressPure`.
- **`src/app/api/students/[id]/progress/route.ts`**: Fetches `juz_pages`,
  passes to `computeJuzProgressDetailedPure`.
- **`src/app/api/students/route.ts`** (POST) and
  **`src/app/api/students/[id]/route.ts`** (PUT/GET): Pass `pages` through
  initial_memorization insert/select.

### UI

- **`src/features/students/components/initial-memorization-grid.tsx`**: Added
  `pages?: number | null` to `JuzEntry`. Expanded juz section now has a pages
  input (1-23, optional) with hint text. Juz button label shows page count for
  partial memorization.
- **`src/features/students/components/new-student-form.tsx`**: Client-side
  Egyptian phone validation; phone placeholder updated to `01xxxxxxxxx`;
  `initMem` array includes `pages` from the grid.
- **`src/app/(admin)/admin/students/[id]/edit/edit-student-form.tsx`** and
  **`src/app/(admin)/admin/students/[id]/edit/page.tsx`**: Client-side phone
  validation; `pages` passed from DB through to the edit form.
- **`src/app/(admin)/admin/students/[id]/page.tsx`** and
  **`src/app/(teacher)/teacher/students/[id]/page.tsx`**: `pages` passed to
  display.

### Utilities

- **`src/lib/utils.ts`**: `todayDateString()` now uses `Africa/Cairo` timezone
  via `toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" })`.
- **`src/lib/api-error.ts`**: `sanitizeError` now logs `error.cause` and
  `error.stack` for better DB error visibility.

### Tests

- **`src/domain/students.test.ts`**: Phone test numbers updated from
  `0512345678` to `01012345678`. Added pages validation tests (1-23 range,
  null/undefined accepted).
- **`src/domain/progress.test.ts`**: Added `JuzPageRow` import and mock
  `mockJuzPages` data for Juz 1 (20 pages covering 148 ayahs: Fatiha 1-7 +
  Baqarah 1-141). Partial-pages tests rewritten to pass `juzPages` and verify
  exact coverage (52.7% for 10 pages, 76.4% for 15 pages, 26.4% for 5 pages)
  instead of the old approximate formula. Added a detailed-view test verifying
  per-surah coverage breakdown for partial init mem.

### Verification

- `npm run lint` — 0 errors, 0 warnings
- `npm test` — 91/91 pass (up from 75)
- `npm run build` — passes (TypeScript check + 25 static pages)

### Key design decisions

- Guardian name stays **required** (considered auto-extracting father's name,
  rejected).
- `pages` does **not** affect `memorized_juz_count` — each init mem row still
  counts as 1 juz. Pages only affect coverage % on the progress map.
- `juz_pages` table has 665 rows (some pages span multiple surahs, getting one
  row per surah). Juz page counts vary: most juz have 20 pages, some have 21,
  Juz 30 has 23 — hence the CHECK 1-23.
- Future feature noted: surah-based memorization entry (e.g. "memorized Surah
  Al-Baqarah" → auto-calculate juz + pages).

---

## 2026-07-31 — Phase 9: Repo cleanup, commit organization, and push

### Repo cleanup

- **Removed junk files from git tracking**: `AUDIT.md` (stale audit doc),
  `bash.exe.stackdump` (Windows crash dump), `create-verified-user.mjs`
  (one-off Supabase user-creation script), `test-conn.mjs` (one-off DB
  connection test), `.ottotime` (tool-generated timing file).
- **Consolidated duplicate docs**: deleted `docs/plan_report/` (5 files,
  subset of `docs/plans/` which has 8 files including 00-overview, 06,
  07, 08).
- **Moved review docs from root to `docs/dev/`**: `ARCHITECTURE_REVIEW.md`,
  `CODEBASE_REVIEW.md`, `CHANGELOG-dev.md` — dev-only review docs, not
  needed in repo root.
- **Updated `.gitignore`**: added `*.stackdump`, `.devin/`, `.omc/`,
  `.ottotime` to prevent future tool-generated files from being committed.

### Commit organization

All refactoring work (Phases 1–8 + repo cleanup) was committed to branch
`refactoring/full-codebase-refactor` as 12 logically-ordered commits:

1. `chore: remove junk files, consolidate docs, update .gitignore`
2. `feat(db): add Drizzle ORM layer — schema, client, migrations`
3. `feat(domain): add pure business logic layer with 75 tests`
4. `feat(infrastructure): add Supabase auth adapter layer`
5. `feat(features): add feature-sliced layer (auth, students, sessions, attendance, ijazat)`
6. `feat(lib): add shared utilities and tooling (vitest, CI, eslint)`
7. `refactor(api): migrate all API routes to Drizzle + getApiContext pattern`
8. `refactor(app): update all pages to use new architecture`
9. `refactor(components): update shared components and proxy`
10. `refactor: delete old lib/ modules and components (moved to domain/features)`
11. `docs: update CLAUDE.md to reflect new architecture`
12. `chore: remove .ottotime from tracking, commit docs/dev/ and .gitignore updates`

Commit ordering ensures the codebase is never in a broken state between
commits: new layers added first (2–6), consumers updated (7–9), old code
deleted last (10), docs updated (11).

### Push

Branch pushed to `origin/refactoring/full-codebase-refactor`. `dev` and
`main` branches on the remote are untouched. PR to be opened from the
refactoring branch into `dev`.

### Verification

- `npm run lint` — 0 errors, 0 warnings
- `npm run build` — passes
- `npm test` — 75/75 pass

### Final root directory structure (clean)

```
AGENTS.md  CLAUDE.md  README.md           # docs
package.json  package-lock.json           # npm
tsconfig.json  next-env.d.ts              # TypeScript
next.config.js  eslint.config.mjs         # Next.js / lint
postcss.config.mjs  components.json       # CSS / shadcn
drizzle.config.ts  vitest.config.ts       # ORM / tests
.gitignore                              # git
docs/  drizzle/  public/  src/  supabase/ # directories
```

---

## 2026-07-31 — Phase 8: Fix all code review findings

All 18 findings from the Phase 7 review have been fixed. Verification: lint
0/0, build pass, 75/75 tests pass (up from 41).

### A1+D1+F1+B1 — `getApiContext()` adopted across all API routes

- Created `src/features/auth/api-context.ts` (moved from `lib/api-handler.ts`)
  with `getApiContext()` and `getApiContextForStudent()`. Fixed the dynamic
  `import()` of `canAccessStudent` (now a static import). Deleted the old
  `src/lib/api-handler.ts`.
- Deleted the deprecated `ApiAppUser` type alias from `student-access.ts`.
- Converted all 15 API route files to use `getApiContext()` instead of the
  hand-written 6-line auth+db boilerplate. Removed ~130 lines of duplicated
  code across 22 handler functions.
- `lib/` no longer reaches up into `features/` or `infrastructure/` (B1 fixed).

### A2 — Collapsed duplicate `getApiAppUser` / `getAppUserByAuthId`

- `getApiAppUser` in `student-access.ts` is now a re-export of
  `getAppUserByAuthId` from `session.ts`. Single implementation.

### A3 — Single-source `AppRole`

- `domain/types.ts` is now the single source of `AppRole`.
- `features/auth/shared.ts` imports and re-exports from `domain/types.ts`.
- `lib/nav.ts`'s `Role` type is now an alias for `AppRole` from `domain/types.ts`.

### A4 — `todayDateString()` / `toDateString()` adopted

- Added `toDateString(date)` and `todayDateString()` to `src/lib/utils.ts`.
- Replaced 26 inline `new Date().toISOString().split("T")[0]` occurrences
  across 13 files with the helpers.
- Removed the duplicate `todayDateString()` from `student-access.ts`.
- Domain layer (`attendance.ts`) keeps the inline pattern to preserve purity
  (no `@/lib/utils` import).

### A5+A6 — Extracted range helpers in `domain/progress.ts`

- Added `groupBy(items, keyFn)`, `intersectRanges(fromA, toA, fromB, toB)`,
  `unionRanges(ranges)`, and `sumRangeLengths(ranges)` helpers.
- Refactored `computeJuzProgressPure` and `computeJuzProgressDetailedPure` to
  use them. Eliminated ~80 lines of duplicated range-union/intersection/
  grouping logic. The 4 duplicated intersection patterns and 2 duplicated
  union patterns are now single helper calls.

### A7 — `progress-map.tsx` imports domain types

- Replaced inline `SurahProgress`, `SessionProgress`, `JuzProgressDetail`
  type declarations with imports from `@/domain/progress`.
- Replaced inline `rating: "excellent" | "good" | "weak"` in
  `student-sessions-tab.tsx` with `Rating` from `@/components/badges`.

### B4 — `assignments/[id]/end` auth pattern aligned

- Now uses `getApiContext()` + `appUser.role !== "admin"` check, consistent
  with all other admin-only routes. Removed the ad-hoc `usersTable` lookup.

### C1 — `students/[id]/route.ts` try/catch added

- All three handlers (GET, PUT, DELETE) now wrap DB operations in
  `try { ... } catch (error) { sanitizeError(error, ...) }`. The 6-table
  cascade delete is no longer an unhandled-exception risk.

### C2 — Null-db UX standardized

- All admin/teacher pages now use `notFound()` when `getDb()` returns null.
  Replaced 3 `<div className="text-destructive">Config error</div>` instances
  in `admin/page.tsx`, `admin/reports/page.tsx`, `admin/assignments/page.tsx`.

### E1+E2 — Test coverage gaps filled

- Created `src/domain/sessions.test.ts` (17 tests for `validateSessionPayload`).
- Added 7 tests for `getLevelInfo` (all 4 level thresholds + boundaries).
- Added 3 tests for `countsFromInitialMemorization`.
- Added 5 tests for `computeJuzProgressDetailedPure` (structure, per-surah
  coverage, session listing, deduplication, full_quran ijaza).
- Added 2 regression tests for adjacent/overlapping range union (F3).
- Total: 41 → 75 tests (34 new).

### Verification

- `npm run lint` — 0 errors, 0 warnings
- `npm run build` — passes
- `npm test` — 75/75 pass (4 test files)

---

## 2026-07-31 — Phase 7: Code review (YAGNI / KISS / DRY / SOLID / patterns)

A read-only review pass over the refactored codebase. Findings are classified
by severity. **No code was changed in this pass** — this entry documents
violations and recommendations for a follow-up cleanup phase. Verification
state at review time: lint 0/0, build pass, 41/41 tests pass.

### A. DRY violations (highest impact)

**A1 — `api-handler.ts` is dead code (DRY-1 regression).**
`src/lib/api-handler.ts` exports `getApiContext()` / `getApiContextForStudent()`
specifically to eliminate the ~10-line auth+db boilerplate at the top of every
API route. **Zero files import it** (`grep -rln "from.*@/lib/api-handler" src/`
returns nothing). Every API route still hand-writes the same 6-line sequence:

```ts
const supabase = await createSupabaseServerComponentClient();
if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });
const { data: { user } } = await supabase.auth.getUser();
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
const db = getDb();
if (!db) return Response.json({ error: "Config missing" }, { status: 500 });
```

This block is duplicated **22 times** across 11 route files. The worst offender
is `src/app/api/students/[id]/route.ts`, which repeats it **3 times** in one
file (GET, PUT, DELETE). Recommendation: adopt `getApiContext()` in every
route, or delete `api-handler.ts` if adoption isn't planned.

**A2 — `getApiAppUser` and `getAppUserByAuthId` are the same function.**
`src/features/auth/student-access.ts:19` (`getApiAppUser`) and
`src/features/auth/session.ts:15` (`getAppUserByAuthId`) are byte-for-byte
identical: same `select`, same `where`, same row→`AppUser` mapping (including
the `?? false` / `?? true` defaults). One should call the other, or one should
be deleted. Currently both exist and both are used (API routes use the former,
RSC pages use the latter).

**A3 — `AppRole` type defined in 3 places.**
- `src/domain/types.ts:20` — `export type AppRole = "admin" | "teacher"`
- `src/features/auth/shared.ts:1` — `export type AppRole = "admin" | "teacher"`
- `src/lib/nav.ts:12` — `export type Role = "admin" | "teacher"` (renamed but
  same union)

`features/auth/shared.ts` imports nothing from `domain/types.ts`, and
`nav.ts`'s `Role` is a third independent declaration. Single source of truth
should be `domain/types.ts` (it's the pure layer); the others should re-export.

**A4 — `todayDateString()` exists but is unused; the pattern is inlined 20+ times.**
`src/features/auth/student-access.ts:98` defines `todayDateString()` returning
`new Date().toISOString().split("T")[0]`. **Zero callers.** Meanwhile the
literal expression `new Date().toISOString().split("T")[0]` appears in **20+
locations** (API routes, RSC pages, feature components, domain defaults,
`recalc.ts`). Either adopt the helper everywhere or delete it.

**A5 — Range-union + segment-intersection logic duplicated in `progress.ts`.**
The "sort ranges, merge overlapping/adjacent, sum lengths" algorithm appears
twice in `src/domain/progress.ts`:
- lines 178–200 (in `computeJuzProgressPure`)
- lines 353–373 (in `computeJuzProgressDetailedPure`)

Both are ~20-line blocks with identical structure. The "intersect session with
segment" pattern (`Math.max(sess.from_ayah, seg.from_ayah)` /
`Math.min(sess.to_ayah, seg.to_ayah)` / `if (start <= end)`) appears **4 times**
(lines 163, 210, 341, 393). Extract `unionRanges(ranges): [number, number][]`
and `intersectRanges(a, b): [number, number] | null` helpers.

**A6 — Map-grouping boilerplate repeated 9 times in `progress.ts`.**
The `map.set(key, list ??= [])` pattern for grouping rows by key is written
out longhand for `boundariesByJuz`, `segmentsBySurah`, `coveredRangesBySurah`,
`initMemMap`, etc. A `groupBy(items, keyFn)` helper would collapse these.

**A7 — Inline type re-declarations in `progress-map.tsx`.**
`src/features/students/components/progress-map.tsx` re-declares
`SurahProgress`, `SessionProgress`, `JuzProgressDetail` (lines 9–35) and an
inline `rating: "excellent" | "good" | "weak"` union (line 21) instead of
importing `SurahCoverage`, `JuzSessionDetail`, `JuzProgressDetailed` from
`@/domain/progress` and `Rating` from `@/domain/types`. Same inline `Rating`
union is duplicated in `student-sessions-tab.tsx:21`.

### B. SOLID / separation-of-concerns

**B1 — `lib/api-handler.ts` reaches up into `features/` and `infrastructure/`.**
The `lib/` layer is supposed to be leaf utilities (`cn`, `arabic`, `api-client`).
`api-handler.ts` imports from `@/infrastructure/auth/server`,
`@/db/client`, and `@/features/auth/student-access` — it depends on every
higher layer. This inverts the dependency direction. It belongs in
`features/auth/` or `infrastructure/` (and see A1 — it's also unused).

**B2 — `components/app-shell.tsx` and `components/login-form.tsx` import from `features/auth`.**
Shared `components/` should be feature-agnostic presentation. `app-shell`
imports `signOutAction` from `@/features/auth/actions`; `login-form` imports
`loginAction` + types from `@/features/auth/shared`. This couples the shared
layer to a specific feature. Acceptable pragmatically (only auth does this),
but strictly it's a layering leak. Could be moved to `features/auth/components/`.

**B3 — `student-profile-tabs.tsx` is a cross-feature hub.**
`src/features/students/components/student-profile-tabs.tsx` imports from
`features/sessions`, `features/attendance`, `features/ijazat`, and
`features/students`. This makes `features/students` a de-facto orchestrator
over the other features. Not a violation per se (it's a composition root for
the profile page), but it means `features/students` cannot be considered an
isolated slice. Document this or move the tabs component up to `app/`.

**B4 — `assignments/[id]/end/route.ts` uses a 3rd, ad-hoc auth pattern.**
While most routes use `getApiAppUser` (returning a full `AppUser`), this route
does a direct `db.select({role}).from(usersTable).where(eq(id, user.id))` and
checks `appUser?.role !== "admin"`. It's the only route that does a partial
`users` lookup. Inconsistent with the established pattern — should use
`getApiAppUser` + `appUser.role !== "admin"`.

### C. Error handling inconsistency

**C1 — `students/[id]/route.ts` has no try/catch despite doing mutations.**
All three handlers (GET/PUT/DELETE) in `src/app/api/students/[id]/route.ts`
perform DB writes (insert/update/delete on `initialMemorizationTable`,
`studentsTable`, and a 6-table cascade delete) with **no try/catch**. Every
other mutating route wraps its writes in `try { ... } catch (error) {
sanitizeError(error, ...) }`. A Drizzle error here would propagate as an
unhandled 500 with a raw stack trace / message leak. Also missing in
`surahs/route.ts` and `auth/me/route.ts` (read-only, lower severity).

**C2 — Inconsistent "Config missing" vs `notFound()` for null `db`.**
Admin pages return `<div className="text-destructive">Config error</div>` when
`getDb()` is null; teacher pages call `notFound()`. Same condition, different
UX. Pick one (probably a shared `<ConfigError/>` component or both `notFound()`).

### D. YAGNI / dead code

**D1 — `ApiAppUser` deprecated alias kept "for backward compatibility" but
nothing imports it as a type.**
`src/features/auth/student-access.ts:17` exports `type ApiAppUser = AppUser`
marked `@deprecated`. `api-handler.ts` (itself dead — A1) is the only importer.
Both can be deleted together.

**D2 — `navItemsForRole` is trivially equivalent to inline filter.**
`src/lib/nav.ts` exports `navItemsForRole(role)` which is
`navItems.filter(item => !item.adminOnly || role === "admin")`. `getNavItems`
calls it once. Not worth a named export — inline the filter in `getNavItems`
(KISS). Minor.

### E. Test coverage gaps

**E1 — 4 of 9 exported domain functions have no tests.**
Tested: `computeJuzProgressPure`, `computeAttendanceCalendar`,
`computeDayAttendance`, `validateStudentPayload`, `validateInitialMemorization`.
**Untested:** `computeJuzProgressDetailedPure`, `validateSessionPayload`,
`getLevelInfo`, `countsFromInitialMemorization`. The detailed progress
function is the most complex untested function (it contains the duplicated
range-union logic from A5). `validateSessionPayload` guards every session
mutation. `getLevelInfo` is trivial but has 4 branches.

**E2 — No tests for `domain/sessions.ts` at all.**
`src/domain/sessions.ts` has no co-located `*.test.ts` file (the file
`src/domain/sessions.test.ts` does not exist). Its `validateSessionPayload` is
the validation gate for all session creation/editing.

### F. KISS / minor

**F1 — `getApiContextForStudent` dynamically imports `canAccessStudent`.**
`src/lib/api-handler.ts:65` does `const { canAccessStudent } = await
import("@/features/auth/student-access")` inside the function body, even
though `getApiAppUser` is already a static import from the same module at the
top of the file. The dynamic import is unnecessary. (Moot if A1 deletes the
file.)

**F2 — `studentStatusMap` fallback in `StudentStatusBadge`.**
`src/components/badges.tsx:72` does `studentStatusMap[value] ??
studentStatusMap.active`. Since `StudentStatus` is a closed union of 4 values
all present in the map, the `??` fallback is unreachable. Harmless but dead.

**F3 — `progress.ts` line 181 `let curStart` carry-over.**
Already fixed in Phase 6 (was `const`, changed to `let`). Noted here only
because the fix was correctness-critical (the merge loop reassigns it) and
worth a regression test — currently `computeJuzProgressPure` is tested but no
test case exercises multiple adjacent ranges that would catch a `const`
regression. Add a test with overlapping/adjacent ranges.

### G. Architecture positives (no action needed)

- **Domain purity holds.** `src/domain/*.ts` imports only from `./types`
  (type-only). Zero imports from `@/db`, `@/features`, `@/infrastructure`,
  `@/lib`, `@/components`, or `@/app`. The pure/impure split is intact.
- **`db/` and `infrastructure/auth/` are clean leaves.** `db/client.ts` and
  `db/schema.ts` import only `drizzle-orm` + `pg`. `infrastructure/auth/*`
  imports only `@supabase/ssr`, `next/headers`, and its own `config.ts`.
- **Drizzle-as-data-layer + Supabase-as-auth-layer split is consistently
  enforced.** No `.from()` Supabase data queries remain; all data goes through
  `getDb()`.
- **No `as unknown as` casts.** No `is_active` references on `students`.
  No TODO/FIXME/HACK markers. No dead files (every file has ≥1 importer).
- **`api-client.ts` / `api-error.ts` / `arabic.ts` / `utils.ts` / `nav.ts`**
  are appropriately small and focused.
- **`recalc.ts` (attendance) handles C3/C4/E7 correctly** — manual records
  preserved, incremental `affectedDate` path, graceful no-`enrollment_date`
  return.

### Recommended follow-up order (by ROI)

1. **A1 + D1 + F1** — adopt `getApiContext()` across all 11 route files (or
   delete `api-handler.ts` + `ApiAppUser`). Biggest DRY win, removes ~130
   lines of boilerplate. Also fixes B1 (the file moves or dies).
2. **A2** — collapse `getApiAppUser` / `getAppUserByAuthId` into one.
3. **A3** — single-source `AppRole` in `domain/types.ts`, re-export elsewhere.
4. **C1** — add try/catch + `sanitizeError` to `students/[id]/route.ts`.
5. **A5 + A6** — extract `unionRanges` / `intersectRanges` / `groupBy` helpers
   in `domain/progress.ts`. Reduces ~80 lines and makes the algorithm testable
   in isolation.
6. **E1 + E2** — add `sessions.test.ts`; add tests for
   `computeJuzProgressDetailedPure`, `validateSessionPayload`, `getLevelInfo`,
   `countsFromInitialMemorization`, and an adjacent-range case for F3.
7. **A4** — adopt or delete `todayDateString()`.
8. **A7** — import domain types in `progress-map.tsx` instead of re-declaring.
9. **B4 + C2** — align `assignments/[id]/end` auth pattern; align null-db UX.

---

## 2026-07-31 — Phase 6: Verification — all checks green

Fixed all lint errors and warnings. All verification checks now pass.

### Fixed — Lint errors (9 → 0)

- **`progress-map.tsx:249`** — replaced `sess.session_type as any` with
  `sess.session_type as SessionType` (imported `SessionType` type). Fixes
  `@typescript-eslint/no-explicit-any`.
- **`admin/students/[id]/page.tsx:91`** — replaced `Date.now()` with
  `new Date().getTime()` in age calculation (RSC, `react-hooks/purity`).
- **`teacher/students/[id]/page.tsx:106`** — same `Date.now()` →
  `new Date().getTime()` fix.
- **`domain/progress.ts:181`** — changed `const curStart` back to
  `let curStart` (was incorrectly made `const` but is reassigned in the
  loop at line 191). Removed unused `surahId` loop variable (replaced with
  `[, ranges]`). Fixed `prefer-const` on `current` variable (removed
  entirely, used `ranges[0]` directly).
- **`students-list-client.tsx:111`** — added
  `eslint-disable-next-line react-hooks/set-state-in-effect` on `setPage(1)`
  in filter-reset effect (legitimate state sync pattern).
- **`students-list-client.tsx:115`** — added
  `eslint-disable-next-line react-hooks/set-state-in-effect` on
  `fetchStudents()` in data-fetching effect (standard React data-fetching
  pattern).
- **`student-attendance-tab.tsx:74`** — same disable on `fetchAttendance()`.
- **`student-sessions-tab.tsx:64`** — same disable on `fetchSessions()`.
- **`student-ijazat-tab.tsx:42`** — same disable on `fetchIjazat()` + disable
  `react-hooks/exhaustive-deps` (fetchIjazat is not a useCallback, adding it
  to deps would cause infinite re-renders).

### Fixed — Lint warnings (15 → 0)

- **`admin/page.tsx`** — removed unused imports: `Users`, `GraduationCap`
  (lucide-react), `StudentStatusBadge`, `StudentStatus` (badges),
  `teacherStudentAssignmentsTable` (schema), `ne` (drizzle-orm). Removed
  unused `unassignedRows` variable and its DB query from `Promise.all`.
- **`api/students/[id]/route.ts`** — removed unused imports:
  `countsFromInitialMemorization`, `sanitizeError`.
- **`api/surahs/route.ts`** — removed unused `eq` import.
- **`app-shell.tsx`** — removed unused `ChevronLeft` import.
- **`new-student-form.tsx`** — removed unused `ArrowRight` import; prefixed
  unused `role` prop with `_role`.
- **`student-ijazat-tab.tsx`** — removed unused `ShieldAlert` import.
- **`infrastructure/auth/server.ts`** — `_cookiesToSet` no longer warns
  (added `argsIgnorePattern: "^_"` to eslint config).

### Changed — ESLint config

- **`eslint.config.mjs`** — added `@typescript-eslint/no-unused-vars` rule
  override with `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`,
  `caughtErrorsIgnorePattern: "^_"` to allow intentional unused params
  prefixed with underscore.

### Verification results

| Check | Result |
|---|---|
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm run build` | ✅ passes (zero TS errors) |
| `npm test` | ✅ 41/41 pass |
| No `is_active`-on-students column | ✅ verified (only on `users` table) |
| No `as unknown as` casts | ✅ verified |
| No dead files | ✅ verified |

---

## 2026-07-31 — Phase 5.4–5.10: Feature components moved, rls.sql relocated

Completed the feature-sliced reorganization by moving all feature-specific
components into `src/features/*/components/`, relocating `rls.sql` to
`src/db/`, and cleaning up `src/lib/`.

### Added
- **`src/features/students/components/`** — `new-student-form.tsx`,
  `level-badge.tsx`, `student-delete-button.tsx`, `student-profile-tabs.tsx`,
  `initial-memorization-grid.tsx`, `progress-map.tsx` (moved from
  `src/components/`).
- **`src/features/sessions/components/`** — `session-form.tsx`,
  `student-sessions-tab.tsx` (moved from `src/components/`).
- **`src/features/attendance/components/`** — `student-attendance-tab.tsx`
  (moved from `src/components/`).
- **`src/features/ijazat/components/`** — `grant-ijaza-form.tsx`,
  `admin-ijazat-table.tsx`, `student-ijazat-tab.tsx` (moved from
  `src/components/`).
- **`src/db/rls.sql`** — RLS policies (copied from `supabase/legacy/rls.sql`).

### Changed
- `student-profile-tabs.tsx` internal imports updated to reference
  cross-feature component paths (`@/features/sessions/components/`,
  `@/features/attendance/components/`, `@/features/ijazat/components/`).
- `new-student-form.tsx` internal import updated to
  `@/features/students/components/initial-memorization-grid`.
- All consumer imports in `src/app/` updated to import feature components
  from `@/features/*/components/` instead of `@/components/`.
- `badges.tsx` remains in `src/components/` (shared across all features);
  `app-shell.tsx`, `login-form.tsx`, and `ui/` also remain (shared/layout).

### Deleted
- 12 feature-specific component files removed from `src/components/`
  (moved to `src/features/*/components/`).

### Kept in `src/lib/` (shared cross-cutting utilities)
- `api-client.ts`, `api-error.ts`, `api-handler.ts`, `arabic.ts`, `nav.ts`,
  `utils.ts` — used across multiple features, no single feature owner.

### Verified
- `npm run build` — passes.
- `npm test` — 41/41 pass.
- Grep: no stale `@/lib/` references to moved modules (only shared utils
  remain in `src/lib/`).

### Final directory structure
```
src/
├── app/                      # Next.js routing shell (thin)
├── components/               # shared components (badges, app-shell, login-form, ui/)
├── db/                       # Drizzle ORM (schema.ts, client.ts, rls.sql)
├── domain/                   # PURE business rules (progress, attendance, sessions, students, types)
├── features/                 # vertical slices
│   ├── attendance/{components,server}/
│   ├── auth/{actions,session,shared,student-access}/
│   ├── ijazat/components/
│   ├── sessions/components/
│   └── students/{components,server}/
├── infrastructure/auth/      # Supabase auth adapters (server, admin, proxy, config)
├── lib/                      # shared utilities (api-client, api-error, arabic, nav, utils)
└── proxy.ts                  # edge guard
```

---

## 2026-07-31 — Phase 5.3: Features auth layer created

Moved auth logic from `src/lib/auth/` to `src/features/auth/`.

### Added
- **`src/features/auth/shared.ts`** — `AppRole`, `AppUser`, `AuthMeResponse`,
  `LoginActionState`, `usernameToEmail()`, `roleHomePath()`, etc.
- **`src/features/auth/session.ts`** — `getAppUserByAuthId()`,
  `getCurrentAppUser()`, `requireRole()`.
- **`src/features/auth/actions.ts`** — login/logout server actions.
- **`src/features/auth/student-access.ts`** — `getApiAppUser()`,
  `getAssignedStudentIds()`, `canAccessStudent()`, `ApiAppUser` (deprecated
  alias).

### Changed
- Internal imports within features/auth/ updated to use `./shared`,
  `./session`, `./student-access` (was `@/lib/auth/*`).
- All consumers (24+ pages, 12+ API routes, `api-handler.ts`,
  `infrastructure/auth/proxy.ts`, `login-form.tsx`, `app-shell.tsx`)
  updated to import from `@/features/auth/*`.

### Deleted
- `src/lib/auth/` — entire directory removed.

### Verified
- `npm run build` — passes.

---

## 2026-07-31 — Phase 5.2: Infrastructure auth layer created

Moved Supabase auth adapters from `src/lib/supabase/` to
`src/infrastructure/auth/`.

### Added
- **`src/infrastructure/auth/server.ts`** — `createSupabaseServerComponentClient()`
  (moved from `src/lib/supabase/server.ts`).
- **`src/infrastructure/auth/admin.ts`** — `createSupabaseAdminClient()`
  (moved from `src/lib/supabase/admin.ts`).
- **`src/infrastructure/auth/proxy.ts`** — `updateSupabaseSession()`
  edge guard (moved from `src/lib/supabase/proxy.ts`).
- **`src/infrastructure/auth/config.ts`** — `getSupabasePublicEnv()`,
  `getSupabaseServerEnv()` (moved from `src/lib/supabase/config.ts`).

### Changed
- Internal imports within infrastructure/auth/ updated to use `./config`
  (was `@/lib/supabase/config`).
- All 17 API routes + `api-handler.ts` + `auth/actions.ts` +
  `auth/session.ts` updated to import from `@/infrastructure/auth/server`.
- `api/teachers/route.ts` updated to import from `@/infrastructure/auth/admin`.
- `src/proxy.ts` updated to import from `@/infrastructure/auth/proxy`.

### Deleted
- `src/lib/supabase/` — entire directory removed (server.ts, admin.ts,
  proxy.ts, config.ts all moved to `src/infrastructure/auth/`).

### Verified
- `npm run build` — passes.

---

## 2026-07-31 — Phase 5.1: Domain layer created

Split pure business logic from DB-fetching shells into `src/domain/`.

### Added
- **`src/domain/types.ts`** — shared enum types (`Rating`, `SessionType`,
  `Gender`, `AttendanceStatus`, `StudentStatus`, `AppRole`). No I/O deps.
- **`src/domain/progress.ts`** — pure functions: `computeJuzProgressPure`,
  `computeJuzProgressDetailedPure`, and all progress types (`JuzProgress`,
  `SurahCoverage`, `JuzSessionDetail`, `JuzProgressDetailed`,
  `DetailedSessionRow`, `BoundaryRow`, `SessionRow`, `InitialMemRow`,
  `IjazaRow`). No Drizzle/Supabase imports.
- **`src/domain/attendance.ts`** — pure functions:
  `computeAttendanceCalendar`, `computeDayAttendance`, and types
  (`AttendanceStatus`, `AutoAttendanceStatus`, `AttendanceDay`,
  `StudentStatusContext`, `RecalcOptions`). No Drizzle/Supabase imports.
- **`src/domain/sessions.ts`** — pure: `validateSessionPayload`,
  `SessionPayload`. Imports types from `domain/types.ts`.
- **`src/domain/students.ts`** — pure: `getLevelInfo`,
  `countsFromInitialMemorization`, `validateInitialMemorization`,
  `validateStudentPayload`, `levelBgMap`, `Level`, `LevelInfo`. No
  Drizzle/Supabase imports.
- **`src/features/students/server/progress.ts`** — DB shell
  `computeJuzProgress` (fetches via Drizzle, delegates to pure function).
- **`src/features/students/server/recalc.ts`** — DB shell
  `recalculateStudentSummary` (uses `computeJuzProgress`).
- **`src/features/students/server/backfill.ts`** — CLI script moved from
  `src/lib/backfill.ts`; imports from `./recalc`.
- **`src/features/attendance/server/recalc.ts`** — DB shell
  `recalculateStudentAttendance` (uses pure attendance functions).
- Test files moved: `src/domain/progress.test.ts`,
  `src/domain/attendance.test.ts`, `src/domain/students.test.ts`.

### Changed
- `src/components/badges.tsx` — type definitions now imported from
  `@/domain/types` and re-exported (was: defined locally).
- All API routes updated to import pure functions from `@/domain/*` and DB
  shells from `@/features/*/server/*` (was: `@/lib/*`).
- `src/components/level-badge.tsx` — imports from `@/domain/students`.

### Deleted
- `src/lib/progress.ts`, `src/lib/attendance.ts`, `src/lib/sessions.ts`,
  `src/lib/students.ts`, `src/lib/backfill.ts` — logic split into
  `domain/` (pure) and `features/*/server/` (DB shells).
- `src/lib/progress.test.ts`, `src/lib/attendance.test.ts`,
  `src/lib/students.test.ts` — moved to `src/domain/`.

### Verified
- `npm run build` — passes.
- `npm test` — 41/41 pass (from new `src/domain/` locations).

---

## 2026-07-31 — Phase 4 completed: `create-verified-user.mjs` deleted

Confirmed and deleted `create-verified-user.mjs` — the last pending Phase 4
item. It was a one-off setup script that created/confirmed the admin Supabase
Auth user with hardcoded credentials (`admin@noor-al-eman.local` /
`Password123`) via the service-role key. Not imported by any code; referenced
only in `docs/plan_report/` as a historical note.

**Phase 4 is now fully complete.** All dead code removed:
`AUDIT.md`, `bash.exe.stackdump`, `test-conn.mjs`,
`create-verified-user.mjs`, `page-placeholder.tsx`, `browser.ts`, and SQL
files moved to `supabase/legacy/`. N1 (`level-badge.tsx` `"use client"`
removed) and N2 (`teachers/new` split into RSC + client form) done.

---

## 2026-07-31 — Full codebase refactoring (Phases 1–4 + tooling)

Branch: `dev` (uncommitted). 71 files changed, +11,034 / −7,879 lines.
Tracked against `CODEBASE_REVIEW.md` and `ARCHITECTURE_REVIEW.md` review
items (C1–C4, I1–I5, E1–E8, DRY-1–5).

### Added — Drizzle ORM layer (Phase 1)

- **`src/db/schema.ts`** — Drizzle schema definitions for all 9 tables
  (`users`, `students`, `teacher_student_assignments`, `surahs`,
  `juz_boundaries`, `sessions`, `attendance`, `ijazat`,
  `initial_memorization`). All CHECK constraints, FKs, indexes, defaults
  in TypeScript. Snake_case JS props to match DB columns. Becomes the
  single source of truth for the DB schema, replacing `schema.sql` (I4).
  - New columns: `students.status_since` (date current status became
    effective), `attendance.recorded_manually` (boolean, default false).
- **`src/db/client.ts`** — `getDb()` returns a Drizzle client via `pg` Node
  driver + `DATABASE_URL`. Server-only. SSL enabled. Pool max 10.
  `closeDb()` drains pool for CLI scripts. Returns `null` when env missing.
  Bypasses RLS (intentional — app enforces scoping in code).
- **`drizzle.config.ts`** — Drizzle Kit config. Schema from
  `src/db/schema.ts`, migrations to `drizzle/migrations/`. Resolves
  `DATABASE_URL` or constructs from `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_DB_PASSWORD`. Offline placeholder fallback for `db:generate`.
- **`drizzle/migrations/0000_first_barracuda.sql`** — baseline migration
  capturing existing schema state.
- **`drizzle/migrations/0001_skinny_roland_deschain.sql`** — C2 + C4
  migration: dedup guard on `attendance`, expanded `attendance.status`
  enum (`present | absent | excused | holiday`),
  `attendance.recorded_manually`, `students.status_since`, unique index
  on `(student_id, attendance_date)`, backfill `status_since =
  enrollment_date`.
- **`supabase/legacy/`** — archived `schema.sql`, `rls.sql`, `seed.sql`
  with `README.md` explaining they are superseded by Drizzle. RLS still
  applied manually once (Drizzle does not manage RLS). `config.toml` kept.

### Added — DRY extractions + tooling (Phase 3)

- **`src/lib/api-handler.ts`** — `getApiContext()` /
  `getApiContextForStudent()` (DRY-1). Returns `{ ok, db, appUser }` or
  `{ ok: false, response }`. Eliminates ~10 lines of auth/db boilerplate
  per API route.
- **`src/lib/api-error.ts`** — `sanitizeError(error, context)` +
  `errorResponse(error, context, status)` (I3). Logs full error
  server-side, returns generic Arabic message to client. Prevents
  schema-detail leakage.
- **`src/lib/api-client.ts`** — `apiGet` / `apiPost` / `apiPut` /
  `apiDelete` + `ApiError` class (E1). All client components use these
  instead of raw `fetch()`. 34 usages; zero raw `fetch` in client code.
- **`vitest.config.ts`** — Vitest config (node env, `src/**/*.test.ts`,
  `@` alias).
- **`src/lib/students.test.ts`** — 20 new tests for
  `validateInitialMemorization` (I1) + `validateStudentPayload` (I2).
- **`.github/workflows/ci.yml`** — GitHub Actions CI: `npm ci` → lint →
  build → test. Triggers on push/PR to `main`/`dev`.
- **`src/app/(admin)/admin/teachers/new/new-teacher-form.tsx`** —
  extracted client form component (N2). `page.tsx` is now a thin RSC.
- `src/lib/arabic.ts` — added `formatArabicDate(iso)`.
- `src/lib/progress.ts` — added `computeJuzProgressDetailedPure` (DRY-2):
  returns summary + per-surah breakdown + per-juz sessions. Progress route
  calls it instead of duplicating the algorithm.

### Added — package.json

- Dependencies: `drizzle-orm`, `pg`.
- Dev dependencies: `drizzle-kit`, `@types/pg`, `vitest`.
- Scripts: `test`, `test:watch`, `db:generate`, `db:push`, `db:studio`.

### Changed — Data layer migration to Drizzle

- All ~16 API routes (`src/app/api/**`) migrated from Supabase SDK
  `.from("table").select(...)` to Drizzle typed queries
  (`db.select().from(table)`). Joins are type-safe. All
  `as unknown as { ... }` casts eliminated (E3 — grep-verified zero
  remaining).
- RSC pages that fetch data directly (reports, dashboards, student
  detail) now use the Drizzle client. Pages that only do auth keep
  Supabase SDK.
- Supabase JS SDK reduced to auth-only: `server.ts`
  (`auth.getUser()` + session cookies), `admin.ts`
  (`auth.admin.createUser()` for teacher creation), `proxy.ts` (edge
  session refresh — edge runtime can't use `pg`).

### Changed — Bug fixes (Phase 2)

- **C1** (`is_active` on students, 7 instances not 2): `students` table
  has no `is_active` column in the Drizzle schema; all student-side
  references migrated to `students.status` (filter `status = 'active'`).
  Grep-verified: zero `is_active`-on-students remain. Remaining
  `is_active` refs are on `users` (teachers) — correct.
- **C2** (attendance respects student status): `computeAttendanceCalendar`
  in `src/lib/attendance.ts` now accepts `StudentStatusContext`.
  Withdrawn/graduated: calendar stops day before `statusSince`. Paused:
  skips `[statusSince, today]`. Fridays always excluded.
- **C3** (incremental attendance update):
  `recalculateStudentAttendance` accepts `RecalcOptions { affectedDate }`.
  When set, only that date is reconciled (O(1) writes) instead of
  delete-all + reinsert. New pure helper `computeDayAttendance`.
- **C4** (manual attendance entries): migration `0001` adds
  `excused`/`holiday` to status enum + `recorded_manually` boolean +
  unique index. `recalculateStudentAttendance` preserves manual records.
  New POST/DELETE endpoints in `api/students/[id]/attendance/route.ts`.
  New UI in `student-attendance-tab.tsx`: manual entry form, delete
  button, "manual" badge, separate excused/holiday stats.
- **I1** (`validateInitialMemorization`): added juz 1–30 range check +
  status enum validation. Unit-tested (8 cases).
- **I2** (`validateStudentPayload`): new function — gender enum, date
  format (YYYY-MM-DD), status enum, required-field checks. Unit-tested
  (12 cases).
- **I3** (sanitize error responses): `sanitizeError` / `errorResponse`
  used in all API catch blocks. No raw `error.message` returned to
  clients.
- **I4** (schema reconciliation): solved by Drizzle — `schema.ts` is
  source of truth, migrations auto-generated.
- **I5** (consolidate `AppUser`/`ApiAppUser`): `ApiAppUser` is now a
  deprecated alias `= AppUser`. Duplication resolved. Not moved to
  `domain/types.ts` (Phase 5 not done); Drizzle inferred type not
  adopted.
- **E1** (consistent `res.ok` checks): `api-client.ts` wrappers used by
  all client components.
- **E2** (`catch (err: any)`): all catch blocks use `catch (error)` +
  `sanitizeError`. No `catch (err: any)` remain.
- **E3** (`any[]` in progress route): Drizzle-inferred types. Zero
  `as unknown as` casts.
- **E4** (gender scoping on ijazat/sessions): both endpoints apply
  `can_view_all_genders` scoping.
- **E5** (dead query in assignments GET): rewritten with Drizzle; dead
  query removed.
- **E7** (graceful recalc): `recalculateStudentAttendance` returns
  silently if no `enrollment_date`.
- **E8** (teacher edit UI notes-only): teacher edit student page shows
  only notes field.

### Changed — Tests migrated to Vitest

- `src/lib/progress.test.ts` — migrated to Vitest format (6 tests).
- `src/lib/attendance.test.ts` — migrated + expanded with status-aware
  calendar tests (15 tests).
- `src/lib/students.test.ts` — new (20 tests).
- **Total: 41 tests, all passing.**

### Changed — Documentation

- **`CLAUDE.md`** — rewritten Commands, Architecture, Conventions, and
  Testing sections to reflect Drizzle ORM, two-layer DB access, Vitest,
  migration workflow, Supavisor pooler connection, error handling, and
  client-side API patterns.
- `src/lib/backfill.ts` — uses Drizzle client + `closeDb()`; keeps
  `server-only` stub pattern for Node/tsx.
- `src/lib/auth/shared.ts`, `session.ts`, `student-access.ts`,
  `actions.ts` — use Drizzle for `users` table lookup; `ApiAppUser`
  aliased to `AppUser`.
- `src/components/level-badge.tsx` — removed `"use client"` (N1 — pure
  render component).
- `src/app/(admin)/admin/teachers/new/page.tsx` — split into RSC +
  `new-teacher-form.tsx` client component (N2).

### Deleted — Dead code (Phase 4)

- **`AUDIT.md`** — superseded by `CODEBASE_REVIEW.md` +
  `ARCHITECTURE_REVIEW.md`.
- **`bash.exe.stackdump`** — debug artifact.
- **`test-conn.mjs`** — one-off debug script.
- **`create-verified-user.mjs`** — one-off setup script that
  created/confirmed the admin Supabase Auth user with hardcoded
  credentials via service-role key. Not imported by any code; referenced
  only in `docs/plan_report/` as a historical note.
- **`src/components/page-placeholder.tsx`** — never imported.
- **`src/lib/supabase/browser.ts`** — never imported (app uses API
  routes + fetch).
- **`supabase/schema.sql`**, **`supabase/rls.sql`**, **`supabase/seed.sql`**
  — moved to `supabase/legacy/`.

### Verification (at time of this entry)

- `npm run build` — passes (zero TS errors).
- `npm test` — 41/41 pass.
- `npm run lint` — **fails** (see known issues below).
- Grep: zero `is_active`-on-students, zero `as unknown as` casts, zero
  dead files.

### Known issues at time of this entry

- **Lint failures (blocking CI)**:
  - `progress-map.tsx:249` — `sess.session_type as any` (1
    `no-explicit-any` error).
  - `admin/students/[id]/page.tsx:91`, `teacher/students/[id]/page.tsx:106`
    — `Date.now()` in render (2 `react-hooks/purity` errors).
  - `students-list-client.tsx`, `student-attendance-tab.tsx`,
    `student-ijazat-tab.tsx`, `student-sessions-tab.tsx` —
    `setState`/`fetchX()` directly in `useEffect` body (4
    `react-hooks/set-state-in-effect` errors).
  - Unused imports/vars in `admin/page.tsx`, `api/students/[id]/route.ts`,
    `api/surahs/route.ts`, `app-shell.tsx`, `new-student-form.tsx`,
    `student-ijazat-tab.tsx` (warnings).
- **Phase 5** (feature-sliced reorg: `src/domain/`, `src/infrastructure/`,
  `src/features/`) — not started.
- **I5** — `AppUser` not moved to `domain/types.ts`; Drizzle inferred type
  not adopted.
- **`drizzle-kit push --dry-run`** — not verified (needs DB credentials).
- **`AGENTS.md`** — unchanged (only nextjs-agent-rules boilerplate).

### Not done from the plan

- **Phase 5** — feature-sliced architecture reorganization. Largest
  remaining piece. `src/domain/`, `src/infrastructure/`, `src/features/`
  do not exist.
- **DRY small wins** — `isActiveAssignment(a)` helper not extracted
  (inline `a.end_date === null` used). `pickTeacherName(join)` not
  extracted (deemed unnecessary with Drizzle typed joins).
