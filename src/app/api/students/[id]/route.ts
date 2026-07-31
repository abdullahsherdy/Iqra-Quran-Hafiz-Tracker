import { NextRequest } from "next/server";
import { and, eq, isNull, asc } from "drizzle-orm";
import {
  studentsTable,
  teacherStudentAssignmentsTable,
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

    // Role-scope check for teachers
    if (appUser.role === "teacher") {
      if (!appUser.can_view_all_genders && student.gender !== appUser.gender) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      const [assign] = await db
        .select({ id: teacherStudentAssignmentsTable.id })
        .from(teacherStudentAssignmentsTable)
        .where(
          and(
            eq(teacherStudentAssignmentsTable.teacher_id, appUser.id),
            eq(teacherStudentAssignmentsTable.student_id, id),
            isNull(teacherStudentAssignmentsTable.end_date),
          ),
        )
        .limit(1);
      if (!assign) return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Active teachers for this student
    const activeAssignments = await db
      .select({
        id: teacherStudentAssignmentsTable.id,
        teacher_id: teacherStudentAssignmentsTable.teacher_id,
        start_date: teacherStudentAssignmentsTable.start_date,
        teacher_name: usersTable.name,
      })
      .from(teacherStudentAssignmentsTable)
      .leftJoin(usersTable, eq(teacherStudentAssignmentsTable.teacher_id, usersTable.id))
      .where(
        and(
          eq(teacherStudentAssignmentsTable.student_id, id),
          isNull(teacherStudentAssignmentsTable.end_date),
        ),
      );

    // Initial memorization
    const initialMem = await db
      .select({
        juz_number: initialMemorizationTable.juz_number,
        status: initialMemorizationTable.status,
        sheikh_name: initialMemorizationTable.sheikh_name,
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
      const [assign] = await db
        .select({ id: teacherStudentAssignmentsTable.id })
        .from(teacherStudentAssignmentsTable)
        .where(
          and(
            eq(teacherStudentAssignmentsTable.teacher_id, appUser.id),
            eq(teacherStudentAssignmentsTable.student_id, id),
            isNull(teacherStudentAssignmentsTable.end_date),
          ),
        )
        .limit(1);
      if (!assign) return Response.json({ error: "Forbidden" }, { status: 403 });
      if (!appUser.can_view_all_genders && existingStudent.gender !== appUser.gender) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json();

    if (appUser.role === "teacher") {
      const [data] = await db
        .update(studentsTable)
        .set({ notes: body.notes ?? null })
        .where(eq(studentsTable.id, id))
        .returning();

      return Response.json(data);
    }

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
      const initRows: Array<{ juz_number: number; status: string; sheikh_name?: string }> =
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
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

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
      return Response.json({ ok: true, deactivated: true });
    }

    // Permanent delete: cascade all child rows (FKs are not ON DELETE CASCADE, so we
    // do it explicitly via the service-role client which bypasses RLS).
    await db.delete(initialMemorizationTable).where(eq(initialMemorizationTable.student_id, id));
    await db.delete(ijazatTable).where(eq(ijazatTable.student_id, id));
    await db.delete(attendanceTable).where(eq(attendanceTable.student_id, id));
    await db.delete(sessionsTable).where(eq(sessionsTable.student_id, id));
    await db.delete(teacherStudentAssignmentsTable).where(eq(teacherStudentAssignmentsTable.student_id, id));

    await db.delete(studentsTable).where(eq(studentsTable.id, id));

    return Response.json({ ok: true, deleted: true });
  } catch (error) {
    return Response.json({ error: sanitizeError(error, "student delete") }, { status: 500 });
  }
}
