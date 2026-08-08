import { NextRequest } from "next/server";
import puppeteer from "puppeteer";
import { getApiContext } from "@/features/auth/api-context";
import { fetchParentReportData } from "@/features/reports/server/generate-parent-report";
import { generateParentReportHtml } from "@/features/reports/server/parent-report-html";
import type { ReportPeriod } from "@/domain/report-stats";
import { sanitizeError } from "@/lib/api-error";

// POST /api/reports/parent-report
// Body: { studentId: string, period: "week" | "month" | "enrollment" }
// Returns: single PDF blob for one student, rendered via headless Chromium
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    const body = await request.json();
    const { studentId, period } = body as { studentId: string; period: ReportPeriod };

    if (!studentId) {
      return Response.json({ error: "studentId مطلوب" }, { status: 400 });
    }

    if (!["week", "month", "enrollment"].includes(period)) {
      return Response.json({ error: "period غير صحيح" }, { status: 400 });
    }

    const data = await fetchParentReportData(db, studentId, period, appUser.name);

    if (!data) {
      return Response.json({ error: "لم يتم العثور على الطالب" }, { status: 404 });
    }

    const html = generateParentReportHtml(data);

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    await browser.close();
    browser = null;

    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const safeName = data.studentName.replace(/\s+/g, "_");
    const filename = `${safeName}_${dateStr}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report_${dateStr}.pdf"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
    return Response.json({ error: sanitizeError(error, "parent report generation") }, { status: 500 });
  }

}
