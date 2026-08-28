import { NextRequest } from "next/server";
import { canAccessStudent } from "@/features/auth/student-access";
import { loadDetailedProgress } from "@/features/students/server/progress-detailed";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/progress — detailed progress map data
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  if (!(await canAccessStudent(db, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const enrichedProgress = await loadDetailedProgress(db, studentId);
    return Response.json(enrichedProgress);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "progress fetch") }, { status: 500 });
  }
}
