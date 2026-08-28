import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { sanitizeError } from "@/lib/api-error";
import {
  studentsTable,
  sessionsTable,
  usersTable,
} from "@/db/schema";
import { isAdmin, usernameToEmail } from "@/features/auth/shared";
import { createSupabaseAdminClient } from "@/infrastructure/auth/admin";
import { getApiContext } from "@/features/auth/api-context";
import { logAction } from "@/features/audit/audit-log";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/teachers/[id]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [teacher] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      phone: usersTable.phone,
      gender: usersTable.gender,
      can_view_all_genders: usersTable.can_view_all_genders,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "teacher")))
    .limit(1);

  if (!teacher) return Response.json({ error: "Not found" }, { status: 404 });

  // Students this teacher has recorded sessions with (distinct)
  const sessionStudents = await db
    .select({
      student_id: sessionsTable.student_id,
      student_id_2: studentsTable.id,
      student_name: studentsTable.name,
      student_gender: studentsTable.gender,
      student_memorized_juz_count: studentsTable.memorized_juz_count,
      student_status: studentsTable.status,
    })
    .from(sessionsTable)
    .leftJoin(studentsTable, eq(sessionsTable.student_id, studentsTable.id))
    .where(eq(sessionsTable.teacher_id, id))
    .groupBy(sessionsTable.student_id, studentsTable.id, studentsTable.name, studentsTable.gender, studentsTable.memorized_juz_count, studentsTable.status);

  const shapedAssignments = sessionStudents.map((a) => ({
    student_id: a.student_id,
    start_date: "",
    students: {
      id: a.student_id_2,
      name: a.student_name,
      gender: a.student_gender,
      memorized_juz_count: a.student_memorized_juz_count,
      status: a.student_status,
    },
  }));

  return Response.json({ teacher, assignments: shapedAssignments });
}

// PUT /api/teachers/[id] — admin only; update is_active or can_view_all_genders
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const allowedFields = ["is_active", "can_view_all_genders", "name", "phone", "gender"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  // Reset password if provided
  if (body.password) {
    if (typeof body.password !== "string" || body.password.length < 6) {
      return Response.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
    }
    const [existing] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "teacher")))
      .limit(1);
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

    // Email-registered accounts store the full email as `username`; legacy
    // accounts store a bare username mapped to a synthetic email. Use an
    // email-style username as-is instead of double-wrapping it.
    const email = existing.username.includes("@")
      ? existing.username
      : usernameToEmail(existing.username);
    const { error: pwdError } = await admin.auth.admin.updateUserById(id, {
      email,
      password: body.password,
    });
    if (pwdError) {
      return Response.json({ error: sanitizeError(pwdError, "password update") }, { status: 400 });
    }
  }

  try {
    const [data] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "teacher")))
      .returning();
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "update",
      entityType: "teacher",
      entityId: id,
      method: "PUT",
      path: `/api/teachers/${id}`,
      statusCode: 200,
      requestBody: updates,
      responseBody: { id: data.id, name: data.name },
    });
    return Response.json(data);
  } catch (error) {
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "update",
      entityType: "teacher",
      entityId: id,
      method: "PUT",
      path: `/api/teachers/${id}`,
      statusCode: 500,
      requestBody: updates,
      responseBody: { error: sanitizeError(error, "api") },
    });
    return Response.json({ error: sanitizeError(error, "api") }, { status: 500 });
  }
}

// DELETE /api/teachers/[id] — admin only; delete auth user + DB row
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [existing] = await db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "teacher")))
    .limit(1);

  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  try {
    await db.delete(sessionsTable).where(eq(sessionsTable.teacher_id, id));
    await db.execute(sql`DELETE FROM teacher_student_assignments WHERE teacher_id = ${id}`);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    await admin.auth.admin.deleteUser(id);

    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "teacher",
      entityId: id,
      method: "DELETE",
      path: `/api/teachers/${id}`,
      statusCode: 200,
      requestBody: { name: existing.name, username: existing.username },
      responseBody: { ok: true },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const errorMsg = sanitizeError(error, "teacher delete");
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "teacher",
      entityId: id,
      method: "DELETE",
      path: `/api/teachers/${id}`,
      statusCode: 500,
      responseBody: { error: errorMsg },
    });
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
