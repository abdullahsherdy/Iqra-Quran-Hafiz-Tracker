import { getStudentContext } from "@/features/auth/api-context";
import { loadDetailedProgress } from "@/features/students/server/progress-detailed";
import { sanitizeError } from "@/lib/api-error";

// GET /api/student/progress — detailed progress map for the LOGGED-IN student.
// The student id is resolved from the session (getStudentContext), never from
// the URL, so a student can only ever read their own progress.
export async function GET() {
  const ctx = await getStudentContext();
  if (!ctx.ok) return ctx.response;
  const { db, studentId } = ctx;

  try {
    const enrichedProgress = await loadDetailedProgress(db, studentId);
    return Response.json(enrichedProgress);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "progress fetch") }, { status: 500 });
  }
}
