import { NextRequest } from "next/server";
import { canAccessStudent } from "@/features/auth/student-access";
import { loadStudentSessions } from "@/features/students/server/sessions-read";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/sessions — session history for student profile
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  try {
    const result = await loadStudentSessions(db, studentId, {
      sessionType: searchParams.get("session_type") ?? "",
      dateFrom: searchParams.get("date_from") ?? "",
      dateTo: searchParams.get("date_to") ?? "",
      limit: Number(searchParams.get("limit") ?? "100"),
      offset: Number(searchParams.get("offset") ?? "0"),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
