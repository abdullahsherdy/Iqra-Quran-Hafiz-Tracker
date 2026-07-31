import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";

import { createSupabaseAdminClient } from "@/infrastructure/auth/admin";
import { usernameToEmail } from "@/features/auth/shared";
import { sanitizeError } from "@/lib/api-error";
import { usersTable } from "@/db/schema";
import { getApiContext } from "@/features/auth/api-context";

// GET /api/teachers — admin only
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const data = await db
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
    .where(eq(usersTable.role, "teacher"))
    .orderBy(asc(usersTable.name));

  return Response.json(data);
}

// POST /api/teachers — admin only; creates auth user + users row
export async function POST(request: NextRequest) {
  const ctx = await getApiContext();
  if (!ctx.ok) return ctx.response;
  const { db, appUser } = ctx;
  if (appUser.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { name, username, password, phone, gender, can_view_all_genders } = body;

  if (!name || !username || !password || !gender) {
    return Response.json({ error: "name, username, password, gender are required" }, { status: 400 });
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
    return Response.json({ error: sanitizeError(authError, "auth create user") }, { status: 400 });
  }

  // Create users row (same UUID as auth user)
  try {
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: authData.user.id,
        name,
        username: username.trim().toLowerCase(),
        role: "teacher",
        phone: phone ?? null,
        gender,
        can_view_all_genders: can_view_all_genders ?? false,
        is_active: true,
      })
      .returning();
    return Response.json(newUser, { status: 201 });
  } catch (userError) {
    // Roll back auth user
    await admin.auth.admin.deleteUser(authData.user.id);
    return Response.json({ error: sanitizeError(userError, "user insert") }, { status: 500 });
  }
}
