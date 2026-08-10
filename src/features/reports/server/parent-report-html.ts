import { readFileSync } from "fs";
import { join } from "path";
import type { ParentReportData, ParentReportSessionEntry } from "./generate-parent-report";

const regularFontBase64 = readFileSync(
  join(process.cwd(), "public", "fonts", "Amiri-Regular.ttf"),
).toString("base64");

const boldFontBase64 = readFileSync(
  join(process.cwd(), "public", "fonts", "Amiri-Bold.ttf"),
).toString("base64");

const RATING_LABELS: Record<string, string> = {
  excellent: "ممتاز",
  good: "جيد",
  weak: "ضعيف",
};

const TYPE_LABELS: Record<string, string> = {
  new_memorization: "تسميع جديد",
  review: "مراجعة",
};

function formatDateArabic(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(input: string | number | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateParentReportHtml(data: ParentReportData): string {
  const tableRows = data.sessions
    .map(
      (sess: ParentReportSessionEntry) => `
    <tr>
      <td>${escapeHtml(formatDateArabic(sess.session_date))}</td>
      <td>${escapeHtml(sess.surah_name)}</td>
      <td>${escapeHtml(sess.from_ayah)} - ${escapeHtml(sess.to_ayah)}</td>
      <td>${escapeHtml(TYPE_LABELS[sess.session_type] ?? sess.session_type)}</td>
      <td>${escapeHtml(RATING_LABELS[sess.rating] ?? sess.rating)}</td>
      <td>${escapeHtml(sess.pages ?? "-")}</td>
      <td>${escapeHtml(sess.teacher_name)}</td>
    </tr>
  `,
    )
    .join("");

  const ijazatRows = data.ijazat
    .map(
      (ij) => `
    <li class="ijaza-item">
      ${
        ij.ijaza_type === "full_quran"
          ? "القرآن كاملاً"
          : `جزء ${escapeHtml(ij.juz_number)}`
      } — الشيخ: ${escapeHtml(ij.sheikh_name)} — ${escapeHtml(formatDateArabic(ij.ijaza_date))}
    </li>
  `,
    )
    .join("");

  const initialRows = data.initialMemorization
    .map(
      (im) => `
    <div class="init-tile ${im.status === "with_ijaza" ? "tile-ijaza" : "tile-memorized"}">
      <span class="tile-number">${escapeHtml(im.juz_number)}</span>
      <span class="tile-label">${im.status === "with_ijaza" ? "إجازة" : im.pages ? `${escapeHtml(im.pages)} ص` : "حفظ"}</span>
    </div>
  `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تقرير ولي الأمر — ${escapeHtml(data.studentName)}</title>
  <style>
    @font-face {
      font-family: "Amiri";
      src: url(data:font/ttf;base64,${regularFontBase64}) format("truetype");
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: "Amiri";
      src: url(data:font/ttf;base64,${boldFontBase64}) format("truetype");
      font-weight: 700;
      font-style: normal;
    }
    :root {
      --space-xs: 8px;
      --space-sm: 16px;
      --space-md: 24px;
      --space-lg: 32px;
      --space-xl: 48px;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: var(--space-lg);
      font-family: "Amiri", "Noto Naskh Arabic", "Scheherazade New", serif;
      font-size: 11px;
      color: #1f2937;
      background: #f4f5f7;
      direction: rtl;
      text-align: right;
    }
    .report-card {
      max-width: 900px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
      padding-inline: 32px;
      padding-block: var(--space-lg);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #2563eb;
      padding-bottom: var(--space-sm);
      margin-bottom: var(--space-lg);
    }
    .app-name {
      font-size: 20px;
      font-weight: 700;
      color: #2563eb;
      margin: 0;
    }
    .report-date {
      font-size: 10px;
      color: #666;
      margin: 0;
    }
    .title {
      font-size: 15px;
      font-weight: 700;
      text-align: center;
      margin: 0 0 var(--space-lg);
    }
    .student-info {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      margin-bottom: var(--space-lg);
      padding: var(--space-sm);
      background: #f3f4f6;
      border-radius: 8px;
    }
    .info-item {
      flex: 1 1 30%;
      min-width: 140px;
      margin: 0;
    }
    .info-label {
      font-weight: 700;
      color: #6b7280;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #2563eb;
      margin: 0 0 var(--space-sm);
      padding-bottom: var(--space-xs);
      border-bottom: 1px solid #e5e7eb;
    }
    .section + .section {
      margin-top: var(--space-lg);
    }
    .summary-box {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-sm);
      width: 100%;
    }
    .summary-card {
      padding: var(--space-sm);
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      text-align: center;
    }
    .summary-value {
      font-size: 20px;
      font-weight: 700;
      color: #2563eb;
      display: block;
    }
    .summary-label {
      font-size: 9px;
      color: #6b7280;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th, td {
      border-bottom: 1px solid #e5e7eb;
      padding: 12px 16px;
      text-align: right;
    }
    th {
      background: #f4f5f7;
      font-weight: 600;
      color: #374151;
    }
    tbody tr:nth-child(even) {
      background: #fafafa;
    }
    .empty-state {
      text-align: center;
      padding: var(--space-lg);
      color: #9ca3af;
    }
    .ijaza-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .ijaza-item {
      margin-bottom: var(--space-xs);
      font-size: 10px;
    }
    .init-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 6px;
    }
    .init-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 1px solid;
      border-radius: 6px;
      padding: 6px 4px;
      text-align: center;
    }
    .tile-number {
      font-size: 13px;
      font-weight: 700;
    }
    .tile-label {
      font-size: 8px;
      margin-top: 2px;
    }
    .tile-ijaza {
      border-color: #16a34a;
      background: #dcfce7;
      color: #166534;
    }
    .tile-memorized {
      border-color: #2563eb;
      background: #dbeafe;
      color: #1e40af;
    }
    .footer {
      margin-top: var(--space-lg);
      padding-top: var(--space-sm);
      border-top: 1px solid #e5e7eb;
      font-size: 9px;
      color: #9ca3af;
      text-align: center;
    }
    @media (max-width: 600px) {
      .summary-box {
        grid-template-columns: repeat(2, 1fr);
      }
      .init-grid {
        grid-template-columns: repeat(5, 1fr);
      }
    }
    @media print {
      body {
        padding: 0;
        background: #fff;
      }
      .report-card {
        box-shadow: none;
        border-radius: 0;
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <div class="report-card">
    <div class="header">
      <h1 class="app-name">اقرأ — تقرير ولي الأمر</h1>
      <p class="report-date">تاريخ التقرير: ${escapeHtml(formatDateArabic(data.generatedAt))}</p>
    </div>

    <h2 class="title">تقرير الحفظ والمراجعة — ${escapeHtml(data.periodLabel)}</h2>

    <div class="student-info">
      <p class="info-item"><span class="info-label">اسم الطالب:</span> ${escapeHtml(data.studentName)}</p>
      <p class="info-item"><span class="info-label">ولي الأمر:</span> ${escapeHtml(data.guardianName)}</p>
      <p class="info-item"><span class="info-label">تاريخ الانضمام:</span> ${escapeHtml(formatDateArabic(data.enrollmentDate))}</p>
      <p class="info-item"><span class="info-label">المستوى:</span> ${escapeHtml(data.levelLabel)}</p>
      <p class="info-item"><span class="info-label">الأجزاء المحفوظة:</span> ${escapeHtml(data.memorizedJuzCount)} / 30</p>
      <p class="info-item"><span class="info-label">الإجازات:</span> ${escapeHtml(data.ijazaJuzCount)}</p>
    </div>

    <div class="section">
      <h3 class="section-title">ملخص الفترة (${escapeHtml(data.periodLabel)})</h3>
      <div class="summary-box">
        <div class="summary-card">
          <span class="summary-value">${escapeHtml(data.totalSessions)}</span>
          <span class="summary-label">عدد الجلسات</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">${escapeHtml(data.totalPages)}</span>
          <span class="summary-label">عدد الصفحات</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">${escapeHtml(data.attendanceDays)}</span>
          <span class="summary-label">أيام الحضور</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">${escapeHtml(data.memorizedJuzCount)}</span>
          <span class="summary-label">الأجزاء المحفوظة</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">سجل الجلسات</h3>
      ${
        data.sessions.length === 0
          ? '<div class="empty-state">لا توجد جلسات في هذه الفترة</div>'
          : `
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>السورة</th>
            <th>الآيات</th>
            <th>النوع</th>
            <th>التقييم</th>
            <th>الصفحات</th>
            <th>المحفظ</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      `
      }
    </div>

    ${
      data.ijazat.length > 0
        ? `
    <div class="section">
      <h3 class="section-title">الإجازات</h3>
      <ul class="ijaza-list">
        ${ijazatRows}
      </ul>
    </div>
    `
        : ""
    }

    ${
      data.initialMemorization.length > 0
        ? `
    <div class="section">
      <h3 class="section-title">الحفظ السابق قبل الانضمام</h3>
      <div class="init-grid">
        ${initialRows}
      </div>
    </div>
    `
        : ""
    }

    <div class="footer">
      <p>تم إنشاء هذا التقرير بتاريخ ${escapeHtml(formatDateArabic(data.generatedAt))}</p>
      <p>اقرأ — نظام متابعة حفظ القرآن الكريم</p>
    </div>
  </div>
</body>
</html>
`;
}
