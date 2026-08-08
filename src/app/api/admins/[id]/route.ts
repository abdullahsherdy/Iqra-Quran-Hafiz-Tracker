import { NextRequest } from "next/server";
import { eq, and, sql } from "drizzle-orm";

import { createSupabaseAdminClient } from "@/infrastructure/auth/admin";
import { isSuperAdmin, usernameToEmail } from "@/features/auth/shared";
import { sanitizeError } from "@/lib/api-error";
import { usersTable, ijazatTable, sessionsTable } from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";
import { logAction } from "@/features/audit/audit-log";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PUT /api/admins/[id] — super_admin only; update name, phone, is_active, password
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isSuperAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Prevent self-deactivation
  if (id === appUser.id) {
    return Response.json({ error: "لا يمكن تعديل حسابك الخاص من هنا" }, { status: 400 });
  }

  const body = await request.json();
  const allowedFields = ["name", "phone", "is_active"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0 && !body.password) {
    return Response.json({ error: "لا توجد حقول للتحديث" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  // Reset password if provided
  if (body.password) {
    if (typeof body.password !== "string" || body.password.length < 6) {
      return Response.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
    }
    const [existing] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")))
      .limit(1);

    if (!existing) return Response.json({ error: "المشرف غير موجود" }, { status: 404 });

    const email = usernameToEmail(existing.username);
    const { error: pwdError } = await admin.auth.admin.updateUserById(id, {
      email,
      password: body.password,
    });

    if (pwdError) {
      const errorMsg = sanitizeError(pwdError, "password update");
      await logAction(db, {
        userId: appUser.id,
        username: appUser.username,
        action: "update",
        entityType: "admin",
        entityId: id,
        method: "PUT",
        path: `/api/admins/${id}`,
        statusCode: 400,
        requestBody: { password: "***" },
        responseBody: { error: errorMsg },
      });
      return Response.json({ error: errorMsg }, { status: 400 });
    }
  }

  try {
    const [data] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")))
      .returning();

    if (!data) return Response.json({ error: "المشرف غير موجود" }, { status: 404 });

    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "update",
      entityType: "admin",
      entityId: id,
      method: "PUT",
      path: `/api/admins/${id}`,
      statusCode: 200,
      requestBody: { ...updates, password: body.password ? "***" : undefined },
      responseBody: { id: data.id, name: data.name, is_active: data.is_active },
    });

    return Response.json(data);
  } catch (error) {
    const errorMsg = sanitizeError(error, "admin update");
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "update",
      entityType: "admin",
      entityId: id,
      method: "PUT",
      path: `/api/admins/${id}`,
      statusCode: 500,
      responseBody: { error: errorMsg },
    });
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

// GET /api/admins/[id] — super_admin only; fetch single admin
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isSuperAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [admin] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      phone: usersTable.phone,
      gender: usersTable.gender,
      role: usersTable.role,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")))
    .limit(1);

  if (!admin) return Response.json({ error: "المشرف غير موجود" }, { status: 404 });
  return Response.json(admin);
}

// DELETE /api/admins/[id] — super_admin only; delete auth user + DB row
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isSuperAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (id === appUser.id) {
    return Response.json({ error: "لا يمكن حذف حسابك الخاص" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")))
    .limit(1);

  if (!existing) return Response.json({ error: "المشرف غير موجود" }, { status: 404 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  try {
    // Clean up child rows referencing this user before deletion
    await db.delete(ijazatTable).where(eq(ijazatTable.granted_by, id));
    await db.delete(sessionsTable).where(eq(sessionsTable.teacher_id, id));
    await db.execute(sql`DELETE FROM teacher_student_assignments WHERE teacher_id = ${id} OR created_by = ${id}`);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    await admin.auth.admin.deleteUser(id);

    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "admin",
      entityId: id,
      method: "DELETE",
      path: `/api/admins/${id}`,
      statusCode: 200,
      requestBody: { name: existing.name, username: existing.username },
      responseBody: { ok: true },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const errorMsg = sanitizeError(error, "admin delete");
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "delete",
      entityType: "admin",
      entityId: id,
      method: "DELETE",
      path: `/api/admins/${id}`,
      statusCode: 500,
      responseBody: { error: errorMsg },
    });
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
