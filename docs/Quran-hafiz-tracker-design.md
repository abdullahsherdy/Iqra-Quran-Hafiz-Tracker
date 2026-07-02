# اقرأ (Iqra) — Quran Hafiz Tracker Complete Design Document
> A web application to manage and track Quran memorization sessions for a mosque halaqah.
> **App name:** اقرأ | **UI Language:** Arabic (RTL) | **Deployment:** Vercel + Supabase (free tier)

---

## 1. Project Overview

| Field | Value |
|---|---|
| App Name | اقرأ |
| Purpose | Track Quran memorization progress across multiple teachers |
| Users | Admin (mosque management) + Teachers (محفظون) |
| Language | Arabic — full RTL interface |
| Deployment | Cloud (Vercel + Supabase) — free tier |
| Students | Starts ~30 male + ~30 female (one halaqah). **Designed to scale** — the student count will grow; all lists are paginated and filterable, and the free tier comfortably handles thousands of students. |
| Session type | Daily sessions, after Asr prayer |

---

## 2. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Full-stack in one project, Vercel-native |
| Styling | Tailwind CSS + shadcn/ui | RTL support, rapid development, accessible |
| Database | Supabase (PostgreSQL) | Free tier, built-in auth, RLS |
| Auth | Supabase Auth | Role-based access, session handling |
| PDF Generation | @react-pdf/renderer | Arabic PDF with proper RTL text rendering |
| Arabic Font | Cairo or Amiri (Google Fonts) | Clean Arabic rendering in UI and PDF |
| Deployment | Vercel (frontend+backend) + Supabase | Completely free for this scale |

> **Note:** No separate backend server needed. Use Next.js API Routes (server actions) for all backend logic. This keeps deployment simple — one Vercel project + one Supabase project.

---

## 3. User Roles & Permissions

### 3.1 Admin (مشرف — mosque management)
- Full access to all data
- Create and manage teacher accounts
- Create and manage student profiles (including initial memorization)
- Assign each student to one OR MORE teachers (co-teaching allowed) — add/remove teachers anytime
- View all students regardless of teacher
- View admin dashboard with halaqah-wide statistics
- Grant or record ijazat for any student
- Generate and download PDF reports
- Copy WhatsApp text for any student's report
- Revoke or edit any record
- Grant a teacher the `can_view_all_genders` permission (rare cross-gender access)

### 3.2 Teacher (محفظ)
- View students **currently assigned** to them — a student may be shared with other teachers at the same time. The teacher sees the student's FULL history (sessions, ratings, notes, attendance, ijazat) recorded by ANY teacher. Visibility follows having an *active assignment*, not who authored each row.
- Create new student profiles (auto-assigned to self on creation)
- Edit profiles of their currently assigned students
- Record daily sessions for their assigned students
- Mark attendance for their assigned students
- Add notes to student profiles
- Set session ratings (ممتاز / جيد / ضعيف)
- Grant ijaza to their assigned students
- View progress map for their assigned students
- Generate and download PDF reports for their assigned students
- Copy WhatsApp text reports for their assigned students
- View their own teacher dashboard
- **Gender scoping:** by default a teacher can only see / create / be assigned students of the SAME gender. The admin can grant a specific teacher the `can_view_all_genders` permission for the rare case of a teacher working across genders.

### Permission Matrix

| Action | Admin | Teacher |
|---|---|---|
| View all students | ✅ | ❌ (currently assigned only) |
| View full history of an assigned student | ✅ | ✅ (regardless of who recorded it) |
| Create students | ✅ | ✅ (same gender, auto-assigned to self) |
| Edit students | ✅ | ✅ (own assigned) |
| Manage teachers | ✅ | ❌ |
| Grant cross-gender view permission | ✅ | ❌ |
| Reassign students | ✅ | ❌ |
| Record sessions | ✅ | ✅ (assigned) |
| Record attendance | ✅ | ✅ (assigned) |
| Grant ijaza | ✅ | ✅ (assigned) |
| View admin dashboard | ✅ | ❌ |
| Generate PDF reports | ✅ (all) | ✅ (assigned) |
| Send WhatsApp report | ✅ (all) | ✅ (assigned) |

---

## 4. Database Schema

### 4.1 Table: `users`
Stores admin and teacher accounts.

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'teacher')),
  phone         VARCHAR(20),
  gender        TEXT CHECK (gender IN ('male', 'female')),  -- required for teachers (gender scoping)
  can_view_all_genders BOOLEAN DEFAULT false,               -- admin-grantable cross-gender access
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
-- Password is managed by Supabase Auth (auth.users table)
-- Login is username-based in the UI, but Supabase Auth is email-based: map each user to a
-- synthetic auth email internally (e.g. "<username>@halaqa.local") at account creation,
-- and link this row to the Supabase auth user by id.
```

### 4.2 Table: `students`
Core student profiles.

```sql
CREATE TABLE students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100) NOT NULL,
  gender           TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  birth_date       DATE,
  guardian_name    VARCHAR(100) NOT NULL,
  guardian_phone   VARCHAR(20)  NOT NULL,
  enrollment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  is_active        BOOLEAN DEFAULT true,
  -- Cached progress summary: recalculated after any session / ijaza / initial_memorization
  -- write via recalculateStudentSummary(student_id). Enables cheap, indexable list
  -- filtering & sorting (by level / amount memorized / last activity) as the roster grows.
  memorized_juz_count SMALLINT NOT NULL DEFAULT 0,  -- # juz with coverage >= 70% or an ijaza
  ijaza_juz_count     SMALLINT NOT NULL DEFAULT 0,  -- # juz with a formal ijaza (full_quran = 30)
  last_session_date   DATE,                          -- most recent session date (NULL if none)
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Indexes that back the student-list filters/sorts:
CREATE INDEX idx_students_gender   ON students(gender);
CREATE INDEX idx_students_active   ON students(is_active);
CREATE INDEX idx_students_juzcount ON students(memorized_juz_count);
```

### 4.3 Table: `teacher_student_assignments`
Dynamic many-to-many assignments with history tracking.

```sql
CREATE TABLE teacher_student_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES users(id),
  student_id  UUID NOT NULL REFERENCES students(id),
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date    DATE,          -- NULL = currently active
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- A student may have MULTIPLE active teachers at the same time (co-teaching is allowed).
-- Prevent duplicate active rows for the same (teacher, student) pair:
CREATE UNIQUE INDEX uniq_active_assignment
  ON teacher_student_assignments(teacher_id, student_id)
  WHERE end_date IS NULL;
-- Fast lookup of a student's current teachers:
CREATE INDEX idx_active_assignments ON teacher_student_assignments(student_id)
  WHERE end_date IS NULL;
-- To remove a teacher from a student, set end_date = today on that row (history preserved).
```

### 4.4 Table: `surahs`
Reference data — 114 surahs. Seeded once, never modified.

```sql
CREATE TABLE surahs (
  id            INTEGER PRIMARY KEY,  -- Surah number 1–114
  name_arabic   VARCHAR(50) NOT NULL,
  juz_number    INTEGER NOT NULL,     -- Primary juz (where surah starts)
  total_ayahs   INTEGER NOT NULL
);
```

See Section 9 for the full seed SQL (all 114 surahs).

### 4.4.1 Table: `juz_boundaries`
Reference data mapping each juz to the exact surah + ayah ranges it contains.
**Critical:** surahs span multiple juz (e.g. Al-Baqarah covers juz 1, 2, and 3), and the
`surahs.juz_number` column only stores the *starting* juz. Per-juz progress CANNOT be
computed from `surahs` alone — it MUST use this table. Seeded once, never modified.

```sql
CREATE TABLE juz_boundaries (
  juz_number  INTEGER NOT NULL CHECK (juz_number BETWEEN 1 AND 30),
  surah_id    INTEGER NOT NULL REFERENCES surahs(id),
  from_ayah   INTEGER NOT NULL,
  to_ayah     INTEGER NOT NULL,
  PRIMARY KEY (juz_number, surah_id),
  CONSTRAINT valid_juz_range CHECK (from_ayah <= to_ayah)
);
```

Each row is a contiguous segment of one surah that falls inside one juz. See Section 9.1
for the full seed SQL (all juz segments).

### 4.5 Table: `sessions`
Daily memorization session records — the core tracking unit.

```sql
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id),
  teacher_id    UUID NOT NULL REFERENCES users(id),
  session_date  DATE NOT NULL,
  session_type  TEXT NOT NULL CHECK (session_type IN ('new_memorization', 'review', 'Reciting')),
  surah_id      INTEGER NOT NULL REFERENCES surahs(id),
  from_ayah     INTEGER NOT NULL,
  to_ayah       INTEGER NOT NULL,
  rating        TEXT NOT NULL CHECK (rating IN ('excellent', 'good', 'weak')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_ayah_range CHECK (from_ayah <= to_ayah)
);

CREATE INDEX idx_sessions_student ON sessions(student_id, session_date DESC);
CREATE INDEX idx_sessions_teacher ON sessions(teacher_id, session_date DESC);
```

### 4.6 Table: `attendance`
Daily presence tracking.

```sql
CREATE TABLE attendance (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students(id),
  teacher_id       UUID NOT NULL REFERENCES users(id),
  attendance_date  DATE NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
```

### 4.7 Table: `ijazat`
Formal ijaza records — per juz or full Quran.

```sql
CREATE TABLE ijazat (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id),
  granted_by   UUID NOT NULL REFERENCES users(id),
  ijaza_type   TEXT NOT NULL CHECK (ijaza_type IN ('juz', 'full_quran')),
  juz_number   INTEGER CHECK (juz_number BETWEEN 1 AND 30),  -- NULL if full_quran
  sheikh_name  VARCHAR(100) NOT NULL,
  ijaza_date   DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT juz_required_if_type CHECK (
    (ijaza_type = 'juz' AND juz_number IS NOT NULL) OR
    (ijaza_type = 'full_quran' AND juz_number IS NULL)
  )
);
```

### 4.8 Table: `initial_memorization`
Records what a student had memorized before joining. Set at enrollment by admin.

```sql
CREATE TABLE initial_memorization (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id),
  juz_number   INTEGER NOT NULL CHECK (juz_number BETWEEN 1 AND 30),
  status       TEXT NOT NULL CHECK (status IN ('memorized', 'with_ijaza')),
  sheikh_name  VARCHAR(100),  -- Required if status = 'with_ijaza'
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, juz_number)
);
```

---

## 5. Pages & Routes

### 5.1 Authentication
| Route | Description |
|---|---|
| `/login` | Login page — username + password — Arabic UI |
| `/` | Redirect to `/admin` or `/teacher` based on role |

### 5.2 Admin Routes

| Route | Page Name (Arabic) | Description |
|---|---|---|
| `/admin` | لوحة التحكم | Dashboard with halaqah-wide statistics |
| `/admin/students` | الطلاب | All students list — filterable |
| `/admin/students/new` | إضافة طالب | Add student + initial memorization form |
| `/admin/students/[id]` | ملف الطالب | Full student profile |
| `/admin/students/[id]/edit` | تعديل بيانات | Edit student info |
| `/admin/teachers` | المحفظون | All teachers list |
| `/admin/teachers/new` | إضافة محفظ | Add teacher account |
| `/admin/teachers/[id]` | ملف المحفظ | Teacher profile + assigned students |
| `/admin/assignments` | إسناد الطلاب | Manage teacher–student assignments |
| `/admin/reports` | التقارير | Generate PDF + WhatsApp reports |
| `/admin/ijazat` | الإجازات | All ijazat records — all students |

### 5.3 Teacher Routes

| Route | Page Name (Arabic) | Description |
|---|---|---|
| `/teacher` | لوحة تحكم المعلم | Teacher dashboard — today's students |
| `/teacher/students` | طلابي | My currently assigned students |
| `/teacher/students/new` | إضافة طالب | Add a student (auto-assigned to me, same gender) |
| `/teacher/students/[id]` | ملف الطالب | Full student profile — full history (any previous teacher) |
| `/teacher/session/new` | تسجيل جلسة | Record a new session |
| `/teacher/attendance` | الحضور | Daily attendance form |
| `/teacher/ijazat/new` | منح إجازة | Grant ijaza to a student |
| `/teacher/reports` | التقارير | Generate PDF + WhatsApp reports for my students |

---

## 6. Feature Specifications

### 6.1 Student Profile Page
Displayed fields:
- Full name (الاسم الكامل)
- Gender badge (ذكر / أنثى)
- Date of birth (تاريخ الميلاد) — optional
- Age (calculated)
- Guardian name (اسم ولي الأمر)
- Guardian phone (هاتف ولي الأمر)
- Enrollment date (تاريخ الانضمام)
- Current assigned teacher(s) (المحفظون الحاليون) — one or more, shown as chips
- Level badge (المستوى) — derived from `memorized_juz_count` (see 6.1.1)
- Memorized juz count (عدد الأجزاء المحفوظة) + ijaza count (عدد الإجازات)
- Active status (نشط / غير نشط)
- General notes (ملاحظات)

Tabs within student profile:
1. **التقدم** — Quran progress map (visual 30-juz grid)
2. **الجلسات** — Session history with filters
3. **الحضور** — Attendance history with statistics
4. **الإجازات** — Ijaza records

Initial memorization section (shown in profile and in enrollment form):
- Grid of 30 checkable boxes (juz 1–30)
- For each checked juz: status selector (حفظ / إجازة)
- If ijaza: input for sheikh name

---

### 6.1.1 Student List, Search & Filters
The students list (`/admin/students` and `/teacher/students`) is the main entry point and
MUST be fast and easy to scan as the roster grows.

**Search:** free-text by student name or guardian name (debounced).

**Filters (combinable):**
- Gender (الجنس): ذكر / أنثى / الكل
- Level (المستوى): مبتدئ / متوسط / متقدم / خاتم (derived from `memorized_juz_count`)
- Amount memorized (عدد الأجزاء): range 0–30 (min/max juz)
- Has ijaza (حاصل على إجازة): الكل / نعم / لا
- Age (العمر): range (min/max), derived from `birth_date`
- Teacher (المحفظ): filter by any current teacher (admin only; a teacher's list is pre-scoped to their own students)
- Status (الحالة): نشط / غير نشط / الكل
- Last activity (آخر نشاط): active within 7 / 30 days, or inactive

**Sort:** name (أ→ي), memorized_juz_count (high→low), age, last_session_date, enrollment_date.

**Level thresholds (derived from `memorized_juz_count`):**
| Level | Arabic | Juz count |
|---|---|---|
| Beginner | مبتدئ | 0–4 |
| Intermediate | متوسط | 5–14 |
| Advanced | متقدم | 15–29 |
| Completed | خاتم | 30 |

**Performance:** filters/sorts run against the cached columns on `students`
(`memorized_juz_count`, `ijaza_juz_count`, `last_session_date`, `gender`, `birth_date`,
`is_active`) plus the active-assignment join — all indexable. The list is **paginated**
(page size 25) so it stays fast regardless of student count.

### 6.2 Session Recording

**UI Flow:**
1. Select student from dropdown (teacher sees own students only)
2. Date picker (defaults to today)
3. Session type selector — large tappable buttons:
   - 📖 حفظ جديد (blue)
   - 🔁 مراجعة (purple)
   - 🎧 تسميع (teal)
4. Surah dropdown — shows: `٣٦ - يس` format (number + Arabic name)
5. From ayah (آية من) — numeric input, min=1 max=surah.total_ayahs
6. To ayah (آية إلى) — numeric input, validated ≥ from_ayah
7. Live text preview: "سورة يس من الآية ٢٠ إلى الآية ٣٥"
8. Rating — 3 large colored buttons:
   - ✅ ممتاز (green)
   - 🟡 جيد (amber)
   - ❌ ضعيف (red)
9. Notes textarea (ملاحظات) — optional
10. Save button (حفظ)

**Validation:**
- All required fields must be filled before submit
- to_ayah ≤ surah.total_ayahs with Arabic error message
- from_ayah ≤ to_ayah check

---

### 6.3 Attendance Recording

**UI:** Daily attendance form for teacher's students
- Header: current date
- List of all assigned students (sorted: active first)
- Per student: 3-button toggle: حاضر (green) / غائب (red) / متأخر (amber)
- Default: حاضر selected
- Optional notes field per student (expandable)
- Bulk "Submit All" button at bottom

**Business Logic:**
- One record per student per day (upsert on conflict)
- Teacher can edit today's attendance but not past dates (admin can edit any)

---

### 6.4 Quran Progress Map (Visual)

**Layout:** Grid of 30 blocks, one per juz.

**Color Coding per Juz:**
| Color | Status | Condition |
|---|---|---|
| 🟢 Green (+ star icon) | أجاز | A row exists in `ijazat` for this juz, OR `initial_memorization.status = 'with_ijaza'` |
| 🔵 Blue | حافظ بإتقان | Coverage ≥ 70% of the juz ayahs AND ratings not weak-dominant |
| 🟡 Yellow | يحتاج مراجعة | Some coverage but < 70%, OR ≥ 30% of sessions rated weak, OR no session in last 30 days |
| ⚪ Gray | لم يبدأ | Zero coverage for this juz |

**Progress Calculation Logic:**
```
For each juz (1–30):
  1. Load this juz's segments from `juz_boundaries`.
     juz_total_ayahs = Σ (to_ayah - from_ayah + 1) across its segments.
  2. Build the student's covered ayah ranges for this juz:
     - From `sessions`: for each session, INTERSECT (surah_id, from_ayah..to_ayah)
       with each juz_boundaries segment of the SAME surah. The overlap is covered.
     - From `initial_memorization`: if a row exists for this juz, treat the WHOLE juz
       as covered ('memorized' → blue baseline; 'with_ijaza' → green).
  3. UNION the covered ranges per surah BEFORE counting. Reviews re-cover the same
     ayahs, so never sum raw lengths or coverage can exceed 100%.
  4. coverage% = covered_ayahs / juz_total_ayahs * 100.
  5. If an `ijazat` row exists for this juz → override color to green.
```

> **Granularity note:** `initial_memorization` is per-juz while `sessions` are per-ayah.
> The union step reconciles them by treating an initially-memorized juz as a single
> full-range cover, so mixing the two sources stays consistent.

**Block Content:**
- Juz number (الجزء الـ X)
- Coverage percentage (%)
- Ijaza badge if applicable

**On Click:** Expand to show:
- List of surahs in this juz
- Coverage per surah (progress bar)
- Last session date for this juz
- Sessions list (date, type, rating, notes)

---

### 6.5 Ijazat Management

**Ijaza Types:**
- `juz` — Ijaza for a specific juz (e.g., الجزء العاشر)
- `full_quran` — Ijaza for the full Quran (القرآن الكريم كاملاً)

**Fields when granting:**
- Student (auto-filled from context, or searchable)
- Type: جزء واحد / القرآن الكامل
- If juz: Juz number selector (1–30)
- Sheikh name (اسم الشيخ المُجيز) — required
- Date (تاريخ الإجازة)
- Notes (ملاحظات) — optional

**Who can grant:**
- Teacher: only for their currently assigned students
- Admin: for any student, and can also add historical ijazat (from before enrollment)

**Display:** Shown as a badge/card in student profile with sheikh name + date.

---

### 6.6 PDF Report Generation

**Access:** Admin (any student) and Teacher (their currently assigned students) — from `/admin/reports`, `/teacher/reports`, or the student profile page.

**Report Options:**
- Student: select from students you can access (admin: all; teacher: their assigned students)
- Period: أسبوعي (last 7 days) / شهري (select month)

**PDF Content Structure (all in Arabic, RTL):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           تقرير متابعة التحفيظ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

اسم الطالب: [name]           الجنس: ذكر/أنثى
المحفظون: [current teacher names]   الفترة: [from] – [to]
ولي الأمر: [name]            هاتف ولي الأمر: [phone]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 ملخص الفترة
• عدد الجلسات: X جلسة
• الحضور: X حضور / X غياب / X تأخر
• معدل الحضور: XX%

📖 ما تم في هذه الفترة
• حفظ جديد: [surah name] آية [from] → [to]   [rating badge]
• مراجعة:    [surah name] آية [from] → [to]   [rating badge]
• تسميع:      [surah name] آية [from] → [to]   [rating badge]
(repeated for each session)

⭐ التقييمات
• ممتاز: X جلسة
• جيد:   X جلسة
• ضعيف:  X جلسة
• التقييم العام: ممتاز / جيد / يحتاج متابعة

🏆 الإجازات (إن وُجدت في هذه الفترة)
• إجازة الجزء [X] — بإجازة الشيخ [name] بتاريخ [date]

📝 ملاحظات المحفظ
[combined notes from all sessions in period]

📈 إجمالي التقدم
[Small visual: X of 30 ajzaa covered — X with ijaza]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
توقيع المحفظ: ________________    التاريخ: ___________
```

**PDF Technical Requirements:**
- Use @react-pdf/renderer
- Font: Amiri (Arabic, available on Google Fonts — include as embedded font)
- Direction: RTL throughout
- Page size: A4
- All text must use the Arabic font to prevent glyph rendering issues
- Logo or mosque name at top (configurable)

---

### 6.7 WhatsApp Text Export

**Access:** Admin (any student) and Teacher (assigned students) — on the report page or student profile, alongside the PDF button.

**Generated text (copy-to-clipboard):**

```
📚 *تقرير تحفيظ القرآن الكريم*
────────────────────
👤 الطالب: [name]
📅 الفترة: [from_date] — [to_date]
👨‍🏫 المحفظون: [current teacher names]

✅ *الحضور:* [X] يوم حضور من أصل [Y] يوم
📖 *الحفظ الجديد:* [surahs and ayahs]
🔁 *المراجعة:* [surahs and ayahs]
⭐ *التقييم العام:* [ممتاز / جيد / يحتاج متابعة]
🏆 *الإجازات:* [list if any, else "لا يوجد"]

📝 *ملاحظات المحفظ:*
[notes]

جزاكم الله خيراً 🌙
```

**UI:** Button labeled "نسخ للواتساب" — copies text to clipboard — shows toast "تم النسخ ✓"

---

### 6.8 Admin Dashboard Statistics

**Cards Row 1 (summary metrics):**
- إجمالي الطلاب النشطين: [N] (X ذكور | Y إناث)
- إجمالي المحفظين: [N]
- جلسات هذا الأسبوع: [N]
- معدل الحضور هذا الأسبوع: [X%]

**Alerts Section:**
- 🔴 طلاب لم يحضروا منذ 7 أيام أو أكثر (list with names + days absent)
- 🟡 طلاب لم تُسجّل لهم جلسة هذا الأسبوع

**Charts:**
- Bar chart: عدد الجلسات اليومية آخر 30 يوم
- Pie chart: توزيع التقييمات (ممتاز / جيد / ضعيف) هذا الشهر
- Progress bars: كل محفظ → عدد طلابه + متوسط التقييم

**Bottom Section:**
- الإجازات المُمنحة هذا الشهر (list with student name + juz/type + sheikh)
- أفضل الطلاب أداءً هذا الشهر (top 5 by excellent ratings %)

---

### 6.9 Teacher Dashboard

**Sections:**
- رأس الصفحة: "مرحباً [teacher name]" + current date (Arabic)
- بطاقات سريعة: عدد طلابي / جلسات اليوم / حضور اليوم
- قائمة طلابي اليوم — with quick attendance toggle per student
- آخر الجلسات المسجّلة (last 5 sessions)
- زر بارز: "تسجيل جلسة جديدة" (prominent CTA)

---

### 6.10 Dynamic Teacher–Student Assignment

**Model:** A student can have one or more teachers at the SAME time. Assignments are
add/remove operations — not a single replaceable slot.

**Admin Flow:**
1. Go to `/admin/assignments`
2. Table: student name | current teacher(s) as chips | actions
3. "إضافة محفظ" → modal → pick a teacher (same gender unless `can_view_all_genders`) → confirm
   → creates a NEW active assignment row (the existing teachers stay).
4. Remove a teacher chip → sets `end_date = today` on that assignment (history preserved).
5. Gender + duplicate-active guards are enforced (see Section 4.3).

**History:**
- All past assignments preserved (end_date filled)
- Admin can view full assignment history per student (student profile → assignments tab)

---

### 6.11 Data Backup & Export

**Access:** Admin only — button on the admin dashboard ("نسخ احتياطي").

- One-click export of all tables to a downloadable JSON file (timestamped filename).
- Important safety net for a volunteer project on a free tier (e.g. Supabase pauses
  inactive free projects; this protects against accidental data loss).
- Restore for v1 is manual: a documented re-import of the JSON. Full automated restore
  is out of scope for v1.
- Supabase keeps its own backups too, but a user-triggered export is the simplest
  guarantee the admin controls directly.

---

## 7. API Endpoints (Next.js API Routes)

### Auth
```
POST /api/auth/login         { username, password } → { token, user }
POST /api/auth/logout        
GET  /api/auth/me            → { id, name, role }
```

### Students
```
GET    /api/students                    → list (role-scoped) + query filters:
                                          search, gender, level, min_juz, max_juz,
                                          has_ijaza, age_min, age_max, teacher_id,
                                          is_active, last_active_days, sort_by, page
POST   /api/students                    → create (admin, or teacher self-add same-gender)
GET    /api/students/:id                → full profile
PUT    /api/students/:id                → update (admin or assigned teacher)
DELETE /api/students/:id                → soft delete (admin)
GET    /api/students/:id/progress       → quran progress data
GET    /api/students/:id/sessions       → session history (+ filters)
GET    /api/students/:id/attendance     → attendance summary
GET    /api/students/:id/ijazat         → ijaza records
GET    /api/students/:id/teachers       → current active teachers
GET    /api/students/:id/assignments    → assignment history
```

### Sessions
```
GET    /api/sessions                    → list (teacher: own students)
POST   /api/sessions                    → create
PUT    /api/sessions/:id                → update (own or admin)
DELETE /api/sessions/:id                → delete (own or admin)
```

### Attendance
```
GET    /api/attendance                  → list (date range filter)
POST   /api/attendance/bulk             → bulk submit for one day
PUT    /api/attendance/:id              → update single record (admin)
```

### Teachers
```
GET    /api/teachers                    → list (admin)
POST   /api/teachers                    → create (admin)
PUT    /api/teachers/:id                → update (admin)
GET    /api/teachers/:id/students       → current assigned students
```

### Assignments
```
GET    /api/assignments                 → current active assignments (filterable)
POST   /api/assignments                 → ADD a teacher to a student (admin) — student may
                                          keep other active teachers; duplicate-active blocked
POST   /api/assignments/:id/end         → REMOVE a teacher (set end_date = today) (admin)
```

### Ijazat
```
GET    /api/ijazat                      → list (filterable by student, type)
POST   /api/ijazat                      → create
DELETE /api/ijazat/:id                  → revoke (admin)
```

### Surahs
```
GET    /api/surahs                      → all 114 surahs
GET    /api/surahs/:id                  → single surah + ayah count
```

### Reports
```
GET    /api/reports/:studentId          → report data (period query param)
POST   /api/reports/:studentId/pdf      → generate + return PDF blob
GET    /api/reports/:studentId/whatsapp → generate WhatsApp text string
```

### Admin Dashboard
```
GET    /api/admin/stats                 → all dashboard statistics
GET    /api/admin/alerts                → absent students, missing sessions
GET    /api/admin/backup                → export all tables as JSON (admin only)
```

---

## 8. UI/UX Guidelines

### 8.0 UX Principles for Non-Technical Users
The teachers are NOT tech-savvy. Every screen MUST follow these rules:
- **One primary action per screen.** The main button (e.g. "تسجيل جلسة") is large, green, and unmissable.
- **Minimal steps.** Recording a session ≤ 5 taps; whole-group attendance on a single screen.
- **No jargon, no English, no IDs** shown to end users — Arabic labels only.
- **Big touch targets** (≥ 44px). Ratings and attendance use large colored buttons, not tiny dropdowns.
- **Sensible defaults.** Date = today; attendance = حاضر; remember the last surah used per student.
- **Forgiving.** Inline Arabic validation, confirmation dialog before delete, undo toast where possible.
- **Always show where I am.** Clear page titles + active nav highlight.
- **Fast feedback.** Every save shows a success toast ("تم الحفظ ✓") and shows loading states.
- **Empty states guide.** An empty list shows a friendly hint + the button to add the first item.
- **Recoverable.** Soft deletes; the admin can fix mistakes.

### 8.1 Direction & Language
- Set `<html dir="rtl" lang="ar">` globally
- All text in Arabic — no English visible to end users
- Dates: display in Arabic numerals using `toLocaleDateString('ar-EG')`
- Numbers: Arabic-Eastern numerals where culturally appropriate

### 8.2 Typography
- Primary font: **Cairo** (Google Fonts) — excellent Arabic readability at small sizes
- Font weights used: 400 (regular), 500 (medium), 700 (bold)
- Body text: 16px / line-height 1.7
- Import: `https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;700&display=swap`

### 8.3 Color Palette

| Purpose | Color | Hex |
|---|---|---|
| Primary (Islamic green) | Primary actions, nav active | `#1A6B3C` |
| Primary hover | Button hover state | `#145530` |
| Rating: ممتاز | Green badge | `#16a34a` |
| Rating: جيد | Amber badge | `#d97706` |
| Rating: ضعيف | Red badge | `#dc2626` |
| Session: حفظ جديد | Blue badge | `#2563eb` |
| Session: مراجعة | Purple badge | `#7c3aed` |
| Session: تسميع | Teal badge | `#0d9488` |
| Gender: ذكر | Blue tint | `#eff6ff` |
| Gender: أنثى | Pink tint | `#fdf2f8` |
| Juz: أجاز | Green | `#16a34a` |
| Juz: حافظ | Blue | `#2563eb` |
| Juz: يحتاج مراجعة | Amber | `#d97706` |
| Juz: لم يبدأ | Light gray | `#e5e7eb` |
| Background | Page | `#f9fafb` |
| Card | White | `#ffffff` |
| Border | Dividers | `#e5e7eb` |
| Text primary | Main content | `#111827` |
| Text secondary | Labels, hints | `#6b7280` |

### 8.4 Navigation

**Sidebar (right-side, Arabic RTL):**
```
┌─────────────────────┐
│  � اقرأ            │
├─────────────────────┤
│ 🏠 لوحة التحكم     │  (admin) or لوحتي (teacher)
│ 👥 الطلاب          │
│ 👨‍🏫 المحفظون       │  (admin only)
│ 📋 إسناد الطلاب    │  (admin only)
│ 📖 الإجازات        │
│ 📊 التقارير        │  (admin + teacher)
├─────────────────────┤
│ 👤 [username]       │
│ 🚪 تسجيل الخروج    │
└─────────────────────┘
```
- Sidebar width: 240px, right-side
- Active item: green background + bold text
- Mobile: collapses to bottom navigation bar with icons

### 8.5 Common UI Components

**Rating Badge:**
```
ممتاز  → green pill   bg:#dcfce7 text:#166534
جيد    → amber pill   bg:#fef9c3 text:#854d0e
ضعيف   → red pill     bg:#fee2e2 text:#991b1b
```

**Session Type Badge:**
```
حفظ جديد → blue pill    bg:#dbeafe text:#1e40af
مراجعة   → purple pill  bg:#ede9fe text:#5b21b6
تسميع     → teal pill    bg:#ccfbf1 text:#0f766e
```

**Gender Badge:**
```
ذكر  → light blue bg:#eff6ff text:#1d4ed8
أنثى → light pink bg:#fdf2f8 text:#9d174d
```

**Status Badge (attendance):**
```
حاضر  → green
غائب  → red
متأخر → amber
```

### 8.6 Forms
- All inputs align right (RTL)
- Labels above inputs (not inline)
- Error messages in red, below field, in Arabic
- Required fields marked with `*` (in red)
- Surah selector: searchable dropdown showing `[number] - [Arabic name]`
- Ayah inputs: numeric type, with max validation tied to surah.total_ayahs

### 8.7 Mobile Responsiveness
- All pages must work on tablet (teachers may use tablets)
- Session recording optimized for single-hand mobile use
- Attendance form: large touch targets for the 3-status toggle
- Bottom nav bar on mobile with 4 key icons

---

## 9. Seed Data — Surahs & Juz Boundaries

### 9.0 Surahs (114)
Insert once at database setup:

```sql
INSERT INTO surahs (id, name_arabic, juz_number, total_ayahs) VALUES
(1,  'الفاتحة',       1,  7),
(2,  'البقرة',        1,  286),
(3,  'آل عمران',      3,  200),
(4,  'النساء',        4,  176),
(5,  'المائدة',       6,  120),
(6,  'الأنعام',       7,  165),
(7,  'الأعراف',       8,  206),
(8,  'الأنفال',       9,  75),
(9,  'التوبة',        10, 129),
(10, 'يونس',          11, 109),
(11, 'هود',           11, 123),
(12, 'يوسف',          12, 111),
(13, 'الرعد',         13, 43),
(14, 'إبراهيم',       13, 52),
(15, 'الحجر',         14, 99),
(16, 'النحل',         14, 128),
(17, 'الإسراء',       15, 111),
(18, 'الكهف',         15, 110),
(19, 'مريم',          16, 98),
(20, 'طه',            16, 135),
(21, 'الأنبياء',      17, 112),
(22, 'الحج',          17, 78),
(23, 'المؤمنون',      18, 118),
(24, 'النور',         18, 64),
(25, 'الفرقان',       18, 77),
(26, 'الشعراء',       19, 227),
(27, 'النمل',         19, 93),
(28, 'القصص',         20, 88),
(29, 'العنكبوت',      20, 69),
(30, 'الروم',         21, 60),
(31, 'لقمان',         21, 34),
(32, 'السجدة',        21, 30),
(33, 'الأحزاب',       21, 73),
(34, 'سبأ',           22, 54),
(35, 'فاطر',          22, 45),
(36, 'يس',            22, 83),
(37, 'الصافات',       23, 182),
(38, 'ص',             23, 88),
(39, 'الزمر',         23, 75),
(40, 'غافر',          24, 85),
(41, 'فصلت',          24, 54),
(42, 'الشورى',        25, 53),
(43, 'الزخرف',        25, 89),
(44, 'الدخان',        25, 59),
(45, 'الجاثية',       25, 37),
(46, 'الأحقاف',       26, 35),
(47, 'محمد',          26, 38),
(48, 'الفتح',         26, 29),
(49, 'الحجرات',       26, 18),
(50, 'ق',             26, 45),
(51, 'الذاريات',      26, 60),
(52, 'الطور',         27, 49),
(53, 'النجم',         27, 62),
(54, 'القمر',         27, 55),
(55, 'الرحمن',        27, 78),
(56, 'الواقعة',       27, 96),
(57, 'الحديد',        27, 29),
(58, 'المجادلة',      28, 22),
(59, 'الحشر',         28, 24),
(60, 'الممتحنة',      28, 13),
(61, 'الصف',          28, 14),
(62, 'الجمعة',        28, 11),
(63, 'المنافقون',     28, 11),
(64, 'التغابن',       28, 18),
(65, 'الطلاق',        28, 12),
(66, 'التحريم',       28, 12),
(67, 'الملك',         29, 30),
(68, 'القلم',         29, 52),
(69, 'الحاقة',        29, 52),
(70, 'المعارج',       29, 44),
(71, 'نوح',           29, 28),
(72, 'الجن',          29, 28),
(73, 'المزمل',        29, 20),
(74, 'المدثر',        29, 56),
(75, 'القيامة',       29, 40),
(76, 'الإنسان',       29, 31),
(77, 'المرسلات',      29, 50),
(78, 'النبأ',         30, 40),
(79, 'النازعات',      30, 46),
(80, 'عبس',           30, 42),
(81, 'التكوير',       30, 29),
(82, 'الانفطار',      30, 19),
(83, 'المطففين',      30, 36),
(84, 'الانشقاق',      30, 25),
(85, 'البروج',        30, 22),
(86, 'الطارق',        30, 17),
(87, 'الأعلى',        30, 19),
(88, 'الغاشية',       30, 26),
(89, 'الفجر',         30, 30),
(90, 'البلد',         30, 20),
(91, 'الشمس',         30, 15),
(92, 'الليل',         30, 21),
(93, 'الضحى',         30, 11),
(94, 'الشرح',         30, 8),
(95, 'التين',         30, 8),
(96, 'العلق',         30, 19),
(97, 'القدر',         30, 5),
(98, 'البينة',        30, 8),
(99, 'الزلزلة',       30, 8),
(100,'العاديات',      30, 11),
(101,'القارعة',       30, 11),
(102,'التكاثر',       30, 8),
(103,'العصر',         30, 3),
(104,'الهمزة',        30, 9),
(105,'الفيل',         30, 5),
(106,'قريش',          30, 4),
(107,'الماعون',       30, 7),
(108,'الكوثر',        30, 3),
(109,'الكافرون',      30, 6),
(110,'النصر',         30, 3),
(111,'المسد',         30, 5),
(112,'الإخلاص',       30, 4),
(113,'الفلق',         30, 5),
(114,'الناس',         30, 6);
```

### 9.1 Juz Boundaries (all segments)
Maps each juz to the exact surah + ayah ranges it contains. Run after seeding surahs.

```sql
INSERT INTO juz_boundaries (juz_number, surah_id, from_ayah, to_ayah) VALUES
-- Juz 1
(1, 1, 1, 7), (1, 2, 1, 141),
-- Juz 2
(2, 2, 142, 252),
-- Juz 3
(3, 2, 253, 286), (3, 3, 1, 92),
-- Juz 4
(4, 3, 93, 200), (4, 4, 1, 23),
-- Juz 5
(5, 4, 24, 147),
-- Juz 6
(6, 4, 148, 176), (6, 5, 1, 81),
-- Juz 7
(7, 5, 82, 120), (7, 6, 1, 110),
-- Juz 8
(8, 6, 111, 165), (8, 7, 1, 87),
-- Juz 9
(9, 7, 88, 206), (9, 8, 1, 40),
-- Juz 10
(10, 8, 41, 75), (10, 9, 1, 92),
-- Juz 11
(11, 9, 93, 129), (11, 10, 1, 109), (11, 11, 1, 5),
-- Juz 12
(12, 11, 6, 123), (12, 12, 1, 52),
-- Juz 13
(13, 12, 53, 111), (13, 13, 1, 43), (13, 14, 1, 52),
-- Juz 14
(14, 15, 1, 99), (14, 16, 1, 128),
-- Juz 15
(15, 17, 1, 111), (15, 18, 1, 74),
-- Juz 16
(16, 18, 75, 110), (16, 19, 1, 98), (16, 20, 1, 135),
-- Juz 17
(17, 21, 1, 112), (17, 22, 1, 78),
-- Juz 18
(18, 23, 1, 118), (18, 24, 1, 64), (18, 25, 1, 20),
-- Juz 19
(19, 25, 21, 77), (19, 26, 1, 227), (19, 27, 1, 55),
-- Juz 20
(20, 27, 56, 93), (20, 28, 1, 88), (20, 29, 1, 45),
-- Juz 21
(21, 29, 46, 69), (21, 30, 1, 60), (21, 31, 1, 34), (21, 32, 1, 30), (21, 33, 1, 30),
-- Juz 22
(22, 33, 31, 73), (22, 34, 1, 54), (22, 35, 1, 45), (22, 36, 1, 27),
-- Juz 23
(23, 36, 28, 83), (23, 37, 1, 182), (23, 38, 1, 88), (23, 39, 1, 31),
-- Juz 24
(24, 39, 32, 75), (24, 40, 1, 85), (24, 41, 1, 46),
-- Juz 25
(25, 41, 47, 54), (25, 42, 1, 53), (25, 43, 1, 89), (25, 44, 1, 59), (25, 45, 1, 37),
-- Juz 26
(26, 46, 1, 35), (26, 47, 1, 38), (26, 48, 1, 29), (26, 49, 1, 18), (26, 50, 1, 45), (26, 51, 1, 30),
-- Juz 27
(27, 51, 31, 60), (27, 52, 1, 49), (27, 53, 1, 62), (27, 54, 1, 55), (27, 55, 1, 78), (27, 56, 1, 96), (27, 57, 1, 29),
-- Juz 28
(28, 58, 1, 22), (28, 59, 1, 24), (28, 60, 1, 13), (28, 61, 1, 14), (28, 62, 1, 11), (28, 63, 1, 11), (28, 64, 1, 18), (28, 65, 1, 12), (28, 66, 1, 12),
-- Juz 29
(29, 67, 1, 30), (29, 68, 1, 52), (29, 69, 1, 52), (29, 70, 1, 44), (29, 71, 1, 28), (29, 72, 1, 28), (29, 73, 1, 20), (29, 74, 1, 56), (29, 75, 1, 40), (29, 76, 1, 31), (29, 77, 1, 50),
-- Juz 30
(30, 78, 1, 40), (30, 79, 1, 46), (30, 80, 1, 42), (30, 81, 1, 29), (30, 82, 1, 19), (30, 83, 1, 36), (30, 84, 1, 25), (30, 85, 1, 22), (30, 86, 1, 17), (30, 87, 1, 19), (30, 88, 1, 26), (30, 89, 1, 30), (30, 90, 1, 20), (30, 91, 1, 15), (30, 92, 1, 21), (30, 93, 1, 11), (30, 94, 1, 8), (30, 95, 1, 8), (30, 96, 1, 19), (30, 97, 1, 5), (30, 98, 1, 8), (30, 99, 1, 8), (30, 100, 1, 11), (30, 101, 1, 11), (30, 102, 1, 8), (30, 103, 1, 3), (30, 104, 1, 9), (30, 105, 1, 5), (30, 106, 1, 4), (30, 107, 1, 7), (30, 108, 1, 3), (30, 109, 1, 6), (30, 110, 1, 3), (30, 111, 1, 5), (30, 112, 1, 4), (30, 113, 1, 5), (30, 114, 1, 6);
```

---

## 10. Deployment Guide

### 10.1 Prerequisites
- GitHub account (for Vercel deployment)
- Supabase account (free)
- Vercel account (free)

### 10.2 Supabase Setup
1. Create new Supabase project
2. Run schema SQL (all CREATE TABLE statements from Section 4, incl. `juz_boundaries`)
3. Run seed SQL: surahs (Section 9.0) then juz boundaries (Section 9.1)
4. Enable Row Level Security (RLS):
   - Teacher access is based on the **current active assignment**, NOT on who authored a
     row. A teacher can SELECT all of a student's rows (sessions/attendance/ijazat/notes
     from any previous teacher) while an active assignment of that student to them exists
     in `teacher_student_assignments` (end_date IS NULL).
   - INSERT/UPDATE allowed only for students currently assigned to the teacher.
   - A student may have several active teachers at once; `is_assigned` passes if the
     current user has ANY active assignment row for that student.
   - **Gender scoping:** a teacher may only be assigned / create / view students whose
     gender matches the teacher's, unless the teacher has `can_view_all_genders = true`.
   - Admin can do everything (use service_role_key on the server).
   - Implementation tip: define a SQL helper `is_assigned(student_id)` returning whether
     the current auth user has an active assignment, and reference it in the policies.
5. Create first admin account via Supabase dashboard (Auth → Users), then insert the
   matching `users` row (role = 'admin') linked by id.
6. Note: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

### 10.3 Environment Variables
Create `.env.local` locally and add to Vercel dashboard:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...  # server-only, never expose to client
# Sessions/auth are handled by Supabase Auth — no NextAuth secret needed.
AUTH_EMAIL_DOMAIN=halaqa.local        # used to build synthetic emails from usernames
NEXT_PUBLIC_APP_NAME=اقرأ
```

### 10.4 Vercel Deployment
```bash
git init
git add .
git commit -m "initial commit"
# Push to GitHub, then connect repo to Vercel
# OR: npx vercel --prod
```

Result: app available at `https://your-app-name.vercel.app`
Share URL with all 4 laptops — works in any browser, no installation.

### 10.5 Cost
| Service | Free Tier Limits | Sufficient? |
|---|---|---|
| Supabase | 500MB DB, 50MB file storage, 50K MAU | ✅ Yes (60 students, ~5MB/year) |
| Vercel | 100GB bandwidth, unlimited deployments | ✅ Yes |
| Total Cost | **$0/month** | ✅ |

---

## 11. Implementation Priority Order

### Phase 1 — Foundation
1. Next.js project setup (RTL, Arabic font, Tailwind, shadcn)
2. Supabase integration + auth middleware
3. Login page
4. Role-based routing guard
5. Seed surahs + juz_boundaries data
   (username→synthetic-email mapping for Supabase Auth)

### Phase 2 — Data Management
6. Student CRUD (admin + teacher self-add, gender-scoped, auto-assign to self)
7. Teacher account management (admin) incl. `can_view_all_genders` flag
8. Teacher–student assignment (admin): multi-teacher add/remove, gender + duplicate-active guards
9. Initial memorization form (at student creation)
   - Assignment-based RLS / access helper (`is_assigned`)

### Phase 3 — Daily Operations
10. Session recording form (teacher)
11. Attendance daily form (teacher)
12. Student profile page with session history
13. Notes on students

### Phase 4 — Progress Tracking
14. Quran progress map (visual 30-juz grid)
15. Ijazat management (grant + display)

### Phase 5 — Reports & Dashboards
16. Admin dashboard with statistics
17. Teacher dashboard
18. PDF report generation
19. WhatsApp text export

---

## 12. Key Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| Next.js full-stack (not separate backend) | Single deployment, fewer moving parts, free on Vercel |
| Supabase over Firebase | SQL is better for relational data (sessions, assignments history); better free tier |
| Multiple active teachers per student | Co-teaching is allowed; add/remove teachers, full history preserved |
| Cached summary columns on `students` | Makes list filtering/sorting by level / juz count / activity cheap and scalable; recalculated on each relevant write |
| Session = surah range (not juz) | Teachers think in surahs and ayahs, not juz boundaries |
| Juz progress calculated, not stored | Derived from sessions — stays in sync automatically |
| PDF via @react-pdf/renderer | Best Arabic RTL support; runs server-side in Next.js API route |
| Teachers + admin can generate reports | Matches the original need: a teacher sends progress reports to parents directly, no admin bottleneck |
| Teacher access by current assignment (not row author) | A reassigned student's full history stays visible to the new teacher; the old teacher loses access cleanly |
| Separate `juz_boundaries` reference table | Surahs span multiple juz; per-juz progress is impossible from `surahs.juz_number` alone |
| Gender-scoped teachers + admin override flag | Cultural separation by default, with a rare-case escape hatch the admin controls |
| Union ayah ranges before counting coverage | Reviews re-cover ayahs; summing raw lengths would push coverage past 100% |
| Soft delete for students | Preserves historical session data even if student leaves |

---

*Document version: 1.2 | Generated for local AI coding agent use*