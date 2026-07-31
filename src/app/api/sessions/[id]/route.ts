import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { sessionsTable, surahsTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import type { AppUser } from "@/features/auth/shared";
import { validateSessionPayload } from "@/domain/sessions";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { recalculateStudentAttendance } from "@/features/attendance/server/recalc";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getSessionWithAccess(
  db: Db,
  sessionId: string,
  appUser: AppUser,
) {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  if (!session) return null;

  if (appUser.role === "admin") return session;
  if (appUser.role === "teacher" && session.teacher_id === appUser.id) return session;

  return null;
}

// PUT /api/sessions/[id]
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  const existing = await getSessionWithAccess(db, id, appUser);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const [surah] = await db
    .select({ total_ayahs: surahsTable.total_ayahs })
    .from(surahsTable)
    .where(eq(surahsTable.id, body.surah_id ?? existing.surah_id))
    .limit(1);

  if (!surah) return Response.json({ error: "السورة غير موجودة" }, { status: 400 });

  const validated = validateSessionPayload(
    { ...existing, ...body },
    surah.total_ayahs
  );
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });

  const { data: sessionPayload } = validated;
  if (!(await canAccessStudent(db, appUser, sessionPayload.student_id))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [updated] = await db
      .update(sessionsTable)
      .set(sessionPayload)
      .where(eq(sessionsTable.id, id))
      .returning();

    await recalculateStudentSummary(db, sessionPayload.student_id);
    // If the session date moved, reconcile both the old and new dates.
    await recalculateStudentAttendance(db, sessionPayload.student_id, {
      affectedDate: sessionPayload.session_date,
    });
    if (existing.session_date !== sessionPayload.session_date) {
      await recalculateStudentAttendance(db, sessionPayload.student_id, {
        affectedDate: existing.session_date,
      });
    }
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}

// DELETE /api/sessions/[id]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  const existing = await getSessionWithAccess(db, id, appUser);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, id));

    await recalculateStudentSummary(db, existing.student_id);
    await recalculateStudentAttendance(db, existing.student_id, {
      affectedDate: existing.session_date,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}
