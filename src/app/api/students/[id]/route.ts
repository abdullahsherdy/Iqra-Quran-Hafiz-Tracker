import { NextRequest } from "next/server";
import { eq, asc } from "drizzle-orm";
import {
  studentsTable,
  initialMemorizationTable,
  sessionsTable,
  attendanceTable,
  ijazatTable,
  usersTable,
} from "@/db/schema";
import { validateInitialMemorization, validateStudentPayload } from "@/domain/students";
import { recalculateStudentSummary } from "@/features/students/server/recalc";
import { recalculateStudentAttendance } from "@/features/attendance/server/recalc";
import { getApiContext } from "@/features/auth/api-context";
import { isAdmin } from "@/features/auth/shared";
import { logAction } from "@/features/audit/audit-log";
import { sanitizeError } from "@/lib/api-error";
import { todayDateString } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  try {
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, id))
      .limit(1);

    if (!student) return Response.json({ error: "Not found" }, { status: 404 });

    // Role-scope check for teachers (gender-only, no assignment check)
    if (appUser.role === "teacher") {
      if (!appUser.can_view_all_genders && student.gender !== appUser.gender) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Teachers who have recorded sessions with this student (distinct)
    const teacherRows = await db
      .select({
        teacher_id: sessionsTable.teacher_id,
        teacher_name: usersTable.name,
      })
      .from(sessionsTable)
      .leftJoin(usersTable, eq(sessionsTable.teacher_id, usersTable.id))
      .where(eq(sessionsTable.student_id, id))
      .groupBy(sessionsTable.teacher_id, usersTable.name);
    const activeAssignments = teacherRows
      .filter((r) => r.teacher_name)
      .map((r, i) => ({
        id: `session-${r.teacher_id}`,
        teacher_id: r.teacher_id,
        start_date: "",
        teacher_name: r.teacher_name!,
        _index: i,
      }));

    // Initial memorization
    const initialMem = await db
      .select({
        juz_number: initialMemorizationTable.juz_number,
        status: initialMemorizationTable.status,
        sheikh_name: initialMemorizationTable.sheikh_name,
        pages: initialMemorizationTable.pages,
      })
      .from(initialMemorizationTable)
      .where(eq(initialMemorizationTable.student_id, id))
      .orderBy(asc(initialMemorizationTable.juz_number));

    return Response.json({ student, activeAssignments, initialMem });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "student fetch") }, { status: 500 });
  }
}

// PUT /api/students/[id]
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;

  try {
    const [existingStudent] = await db
      .select({ id: studentsTable.id, gender: studentsTable.gender, status: studentsTable.status })
      .from(studentsTable)
      .where(eq(studentsTable.id, id))
      .limit(1);

    if (!existingStudent) return Response.json({ error: "Not found" }, { status: 404 });

    if (appUser.role === "teacher") {
      if (!appUser.can_view_all_genders && existingStudent.gender !== appUser.gender) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json();

    const allowedFields = ["name", "gender", "birth_date", "guardian_name", "guardian_phone", "enrollment_date", "notes", "status"];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    // Validate the update payload (only the fields being changed).
    const validationError = validateStudentPayload(updates);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    // When status changes, stamp status_since = today so the attendance engine
    // knows when the new status (paused/withdrawn/graduated/active) took effect.
    const statusChanged =
      "status" in body && typeof body.status === "string" && body.status !== existingStudent.status;
    if (statusChanged) {
      updates.status_since = todayDateString();
    }

    if ("initial_memorization" in body) {
      const initRows: Array<{ juz_number: number; status: string; sheikh_name?: string; pages?: number | null }> =
        Array.isArray(body.initial_memorization) ? body.initial_memorization : [];

      const initValidationError = validateInitialMemorization(initRows);
      if (initValidationError) {
        return Response.json({ error: initValidationError }, { status: 400 });
      }

      await db.delete(initialMemorizationTable).where(eq(initialMemorizationTable.student_id, id));

      if (initRows.length > 0) {
        const rowsToInsert = initRows.map((r) => ({
          student_id: id,
          juz_number: r.juz_number,
          status: r.status,
          sheikh_name: r.sheikh_name ?? null,
          pages: r.pages ?? null,
        }));
        await db.insert(initialMemorizationTable).values(rowsToInsert);
      }
    }

    const [data] = await db
      .update(studentsTable)
      .set(updates)
      .where(eq(studentsTable.id, id))
      .returning();

    await recalculateStudentSummary(db, id);
    // Status change reshapes the attendance calendar (pause/withdrawal/graduation).
    if (statusChanged) {
      await recalculateStudentAttendance(db, id);
    }

    const [finalStudent] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, id))
      .limit(1);

    return Response.json(finalStudent ?? data);
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "update",
      entityType: "student",
      entityId: id,
      method: "PUT",
      path: `/api/students/${id}`,
      statusCode: 500,
      responseBody: { error: sanitizeError(error, "student update") },
    });
    return Response.json({ error: sanitizeError(error, "student update") }, { status: 500 });
  }
}

// DELETE /api/students/[id] — admin only.
// Default (soft delete): sets status = 'withdrawn'. History is preserved and the
// profile stays viewable (reversible by setting status back to 'active').
// ?permanent=true : hard delete — cascades every child row then removes the student.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const permanent = searchParams.get("permanent") === "true";

  try {
    const [existing] = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(eq(studentsTable.id, id))
      .limit(1);
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    if (!permanent) {
      // Soft delete: mark as withdrawn (reversible by setting status back to active).
      const today = todayDateString();
      await db
        .update(studentsTable)
        .set({ status: "withdrawn", status_since: today })
        .where(eq(studentsTable.id, id));
      await logAction(db, {
        userId: appUser.id,
        username: appUser.username,
        action: "delete",
        entityType: "student",
        entityId: id,
        method: "DELETE",
        path: `/api/students/${id}`,
        statusCode: 200,
        requestBody: { permanent: false },
        responseBody: { ok: true, deactivated: true },
      });
      return Response.json({ ok: true, deactivated: true });
    }

    // Permanent delete: cascade all child rows (FKs are not ON DELETE CASCADE, so we
    // do it explicitly via the service-role client which bypasses RLS).
    await db.delete(initialMemorizationTable).where(eq(initialMemorizationTable.student_id, id));
    await db.delete(ijazatTable).where(eq(ijazatTable.student_id, id));
    await db.delete(attendanceTable).where(eq(attendanceTable.student_id, id));
    await db.delete(sessionsTable).where(eq(sessionsTable.student_id, id));

    await db.delete(studentsTable).where(eq(studentsTable.id, id));

    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "student",
      entityId: id,
      method: "DELETE",
      path: `/api/students/${id}`,
      statusCode: 200,
      requestBody: { permanent: true },
      responseBody: { ok: true, deleted: true },
    });
    return Response.json({ ok: true, deleted: true });
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "student",
      entityId: id,
      method: "DELETE",
      path: `/api/students/${id}`,
      statusCode: 500,
      responseBody: { error: sanitizeError(error, "student delete") },
    });
    return Response.json({ error: sanitizeError(error, "student delete") }, { status: 500 });
  }
}
