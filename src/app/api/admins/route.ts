import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";

import { createSupabaseAdminClient } from "@/infrastructure/auth/admin";
import { isSuperAdmin, usernameToEmail } from "@/features/auth/shared";
import { sanitizeError } from "@/lib/api-error";
import { usersTable } from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";
import { logAction } from "@/features/audit/audit-log";

// GET /api/admins — super_admin only
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isSuperAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const data = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      role: usersTable.role,
      phone: usersTable.phone,
      gender: usersTable.gender,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .orderBy(asc(usersTable.name));

  return Response.json(data);
}

// POST /api/admins — super_admin only; creates auth user + users row with role "admin"
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (!isSuperAdmin(appUser.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { name, username, password, phone, gender } = body;

  if (!name || !username || !password) {
    return Response.json({ error: "name, username, password are required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const email = usernameToEmail(username);

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    const errorMsg = sanitizeError(authError, "auth create user");
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "create",
      entityType: "admin",
      method: "POST",
      path: "/api/admins",
      statusCode: 400,
      requestBody: { name, username },
      responseBody: { error: errorMsg },
    });
    return Response.json({ error: errorMsg }, { status: 400 });
  }

  // Create users row
  try {
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: authData.user.id,
        name,
        username: username.trim().toLowerCase(),
        role: "admin",
        phone: phone ?? null,
        gender: gender ?? null,
        is_active: true,
      })
      .returning();

    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "create",
      entityType: "admin",
      entityId: newUser.id,
      method: "POST",
      path: "/api/admins",
      statusCode: 201,
      requestBody: { name, username, phone, gender },
      responseBody: { id: newUser.id, name: newUser.name, username: newUser.username },
    });

    return Response.json(newUser, { status: 201 });
  } catch (userError) {
    // Roll back auth user
    await admin.auth.admin.deleteUser(authData.user.id);
    const errorMsg = sanitizeError(userError, "user insert");
    await logAction(db, {
      userId: appUser.id,
      username: appUser.username,
      action: "create",
      entityType: "admin",
      method: "POST",
      path: "/api/admins",
      statusCode: 500,
      requestBody: { name, username },
      responseBody: { error: errorMsg },
    });
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
