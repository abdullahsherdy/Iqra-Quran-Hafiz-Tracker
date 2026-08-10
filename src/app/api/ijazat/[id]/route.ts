import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { ijazatTable } from "@/db/schema";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";
import { isAdmin } from "@/features/auth/shared";
import { logAction } from "@/features/audit/audit-log";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// DELETE /api/ijazat/[id] — admin revoke ijaza
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Get student id of this ijaza before deleting
  const [ijaza] = await db
    .select({ student_id: ijazatTable.student_id })
    .from(ijazatTable)
    .where(eq(ijazatTable.id, id))
    .limit(1);

  if (!ijaza) return Response.json({ error: "الإجازة غير موجودة" }, { status: 404 });

  try {
    await db.delete(ijazatTable).where(eq(ijazatTable.id, id));

    // Recalculate
    await recalculateStudentSummary(db, ijaza.student_id);

    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "ijaza",
      entityId: id,
      method: "DELETE",
      path: `/api/ijazat/${id}`,
      statusCode: 200,
      requestBody: { student_id: ijaza.student_id },
      responseBody: { ok: true },
    });
    return Response.json({ ok: true });
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "ijaza",
      entityId: id,
      method: "DELETE",
      path: `/api/ijazat/${id}`,
      statusCode: 500,
      responseBody: { error: sanitizeError(error, "ijaza delete") },
    });
    return Response.json({ error: sanitizeError(error, "ijaza delete") }, { status: 500 });
  }
}
