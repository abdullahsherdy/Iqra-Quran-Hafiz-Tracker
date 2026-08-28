import { NextRequest } from "next/server";
import { canAccessStudent } from "@/features/auth/student-access";
import { loadReviewSchedule } from "@/features/students/server/review-schedule";
import { todayDateString } from "@/lib/utils";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/review?date=YYYY-MM-DD
// Returns the spaced-repetition review schedule for the given date.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get("date") ?? todayDateString();

  try {
    const schedule = await loadReviewSchedule(db, studentId, targetDate);
    return Response.json(schedule);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "review fetch") }, { status: 500 });
  }
}
