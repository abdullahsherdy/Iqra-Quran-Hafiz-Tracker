# Plan 06 — Reports (PDF + WhatsApp)

**Goal:** Generate a clean Arabic PDF report and a copy-to-clipboard WhatsApp text summary for
a student over a weekly or monthly period. Available to admin (any student) and teacher
(assigned students).

**Depends on:** 05.

**Design references:** §6.6 (PDF), §6.7 (WhatsApp), §3 (who can access), §7 (Reports endpoints).

## YOUR ACTIONS (manual)
- (Optional) Provide a **mosque name and/or logo image** for the PDF header. If none, the app
  uses `NEXT_PUBLIC_APP_NAME` (اقرأ) as the header.

## Tasks
1. **Report data endpoint** `GET /api/reports/:studentId?period=weekly|monthly[&month=YYYY-MM]`:
   aggregate for the period — sessions (by type), attendance counts + rate, rating breakdown +
   overall rating, ijazat granted in the period, combined teacher notes, and an overall
   progress snapshot (X/30 juz covered, X with ijaza). Role-scope access.
2. **PDF** `POST /api/reports/:studentId/pdf` using `@react-pdf/renderer` (§6.6):
   - A4, full RTL, **embed the Amiri font** so Arabic glyphs render correctly.
   - Lay out exactly the structure in §6.6 (header with student/guardian/teachers/period,
     period summary, what-was-done list, ratings, ijazat, notes, overall progress, signature
     line). Header shows mosque name/logo or اقرأ.
   - Return a downloadable blob; filename includes student name + period.
3. **WhatsApp text** `GET /api/reports/:studentId/whatsapp` (§6.7): build the exact template;
   expose a "نسخ للواتساب" button that copies to clipboard and shows a "تم النسخ ✓" toast.
4. Wire both into `/admin/reports`, `/teacher/reports`, and the student profile. The student
   picker is role-scoped (admin: all; teacher: assigned).

## Acceptance criteria
- A weekly and a monthly PDF generate with correct Arabic (no broken/boxed glyphs), correct
  RTL layout, and accurate numbers matching the student's data.
- The WhatsApp text copies to clipboard and reads naturally in Arabic.
- A teacher can only generate reports for their assigned students; admin for any.

## Notes for the implementer
- Font embedding is the usual cause of broken Arabic PDFs — register Amiri before rendering and
  apply it to every text node.
- Reuse the aggregation from the data endpoint for both PDF and WhatsApp to avoid drift.
