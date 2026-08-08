import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/db/client";
import { sessionsTable, sessionItemsTable, surahsTable } from "@/db/schema";
import { canAccessStudent } from "@/features/auth/student-access";
import { isAdmin, type AppUser } from "@/features/auth/shared";
import { validateSessionPayload } from "@/domain/sessions";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { recalculateStudentAttendance } from "@/features/attendance/server/recalc";
import { sanitizeError } from "@/lib/api-error";
import { getApiContext } from "@/features/auth/api-context";
import { logAction } from "@/features/audit/audit-log";
import { todayDateString } from "@/lib/utils";

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

  if (isAdmin(appUser.role)) return session;
  if (appUser.role === "teacher" && session.teacher_id === appUser.id) return session;

  return null;
}

// GET /api/sessions/[id] — fetch single session with items
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  const existing = await getSessionWithAccess(db, id, appUser);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const items = await db
    .select({
      id: sessionItemsTable.id,
      session_type: sessionItemsTable.session_type,
      surah_id: sessionItemsTable.surah_id,
      from_ayah: sessionItemsTable.from_ayah,
      to_ayah: sessionItemsTable.to_ayah,
      rating: sessionItemsTable.rating,
      pages: sessionItemsTable.pages,
      notes: sessionItemsTable.notes,
      surah_name: surahsTable.name_arabic,
    })
    .from(sessionItemsTable)
    .leftJoin(surahsTable, eq(sessionItemsTable.surah_id, surahsTable.id))
    .where(eq(sessionItemsTable.session_id, id));

  return Response.json({
    ...existing,
    items: items.map((i) => ({ ...i, surah_name: i.surah_name ?? "" })),
  });
}

// PUT /api/sessions/[id] — update session + replace items
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  const existing = await getSessionWithAccess(db, id, appUser);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // Fetch surah ayah counts for all surah_ids in items
  const surahIds: number[] = Array.isArray(body.items)
    ? body.items.map((i: { surah_id?: number }) => Number(i?.surah_id)).filter((n: number) => !Number.isNaN(n) && n > 0)
    : [];

  const surahRows = surahIds.length > 0
    ? await db.select({ id: surahsTable.id, total_ayahs: surahsTable.total_ayahs }).from(surahsTable).where(inArray(surahsTable.id, surahIds))
    : [];

  if (surahIds.length > 0 && surahRows.length !== surahIds.length) {
    return Response.json({ error: "السورة غير موجودة" }, { status: 400 });
  }

  const surahAyahCounts = new Map(surahRows.map((s) => [s.id, s.total_ayahs]));

  // Merge existing fields with body for validation
  const validated = validateSessionPayload(
    {
      student_id: body.student_id ?? existing.student_id,
      session_date: body.session_date ?? existing.session_date,
      overall_rating: body.overall_rating ?? existing.overall_rating,
      notes: body.notes ?? existing.notes,
      items: body.items ?? [],
    },
    surahAyahCounts,
    todayDateString(),
  );
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });

  const { data: sessionPayload } = validated;
  if (!(await canAccessStudent(db, appUser, sessionPayload.student_id))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const oldStudentId = existing.student_id;
  const oldSessionDate = existing.session_date;
  const newStudentId = sessionPayload.student_id;
  const newSessionDate = sessionPayload.session_date;

  try {
    const [updated] = await db.transaction(async (tx) => {
      const [session] = await tx
        .update(sessionsTable)
        .set({
          student_id: sessionPayload.student_id,
          session_date: sessionPayload.session_date,
          overall_rating: sessionPayload.overall_rating,
          notes: sessionPayload.notes ?? null,
        })
        .where(eq(sessionsTable.id, id))
        .returning();

      // Replace all items: delete old, insert new
      await tx.delete(sessionItemsTable).where(eq(sessionItemsTable.session_id, id));

      const itemRows = sessionPayload.items.map((item) => ({
        session_id: id,
        session_type: item.session_type,
        surah_id: item.surah_id,
        from_ayah: item.from_ayah,
        to_ayah: item.to_ayah,
        rating: item.rating,
        pages: item.pages ?? null,
        notes: item.notes ?? null,
      }));

      await tx.insert(sessionItemsTable).values(itemRows);

      return [session];
    });

    // Recalculate new student's summary + attendance
    await recalculateStudentSummary(db, newStudentId);
    await recalculateStudentAttendance(db, newStudentId, {
      affectedDate: newSessionDate,
    });

    // If student changed, recalculate old student too
    if (oldStudentId !== newStudentId) {
      await recalculateStudentSummary(db, oldStudentId);
      await recalculateStudentAttendance(db, oldStudentId, {
        affectedDate: oldSessionDate,
      });
    }

    // If date changed (same student), reconcile old date too
    if (oldStudentId === newStudentId && oldSessionDate !== newSessionDate) {
      await recalculateStudentAttendance(db, newStudentId, {
        affectedDate: oldSessionDate,
      });
    }

    return Response.json(updated);
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "update",
      entityType: "session",
      entityId: id,
      method: "PUT",
      path: `/api/sessions/${id}`,
      statusCode: 500,
      responseBody: { error: sanitizeError(error, "api") },
    });
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
    // session_items cascade-delete via FK ON DELETE CASCADE
    await db.delete(sessionsTable).where(eq(sessionsTable.id, id));

    await recalculateStudentSummary(db, existing.student_id);
    await recalculateStudentAttendance(db, existing.student_id, {
      affectedDate: existing.session_date,
    });
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "session",
      entityId: id,
      method: "DELETE",
      path: `/api/sessions/${id}`,
      statusCode: 200,
      requestBody: { student_id: existing.student_id },
      responseBody: { ok: true },
    });
    return Response.json({ ok: true });
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "session",
      entityId: id,
      method: "DELETE",
      path: `/api/sessions/${id}`,
      statusCode: 500,
      responseBody: { error: sanitizeError(error, "api") },
    });
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}