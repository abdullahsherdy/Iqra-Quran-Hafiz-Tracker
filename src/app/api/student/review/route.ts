import { NextRequest } from "next/server";
import { getStudentContext } from "@/features/auth/api-context";
import { loadReviewSchedule } from "@/features/students/server/review-schedule";
import { todayDateString } from "@/lib/utils";
import { sanitizeError } from "@/lib/api-error";

// GET /api/student/review?date=YYYY-MM-DD — review schedule for the LOGGED-IN
// student. The student id is resolved from the session (getStudentContext),
// never from the URL.
export async function GET(request: NextRequest) {
  const ctx = await getStudentContext();
  if (!ctx.ok) return ctx.response;
  const { db, studentId } = ctx;

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get("date") ?? todayDateString();

  try {
    const schedule = await loadReviewSchedule(db, studentId, targetDate);
    return Response.json(schedule);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "review fetch") }, { status: 500 });
  }
}
