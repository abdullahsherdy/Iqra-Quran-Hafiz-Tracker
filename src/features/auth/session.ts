import "server-only";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import {
  roleHomePath,
  type AppRole,
  type AppUser,
} from "./shared";
import { createSupabaseServerComponentClient } from "@/infrastructure/auth/server";
import { getDb, type Db } from "@/db/client";
import { usersTable } from "@/db/schema";

export async function getAppUserByAuthId(
  db: Db,
  authUserId: string
): Promise<AppUser | null> {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      role: usersTable.role,
      gender: usersTable.gender,
      can_view_all_genders: usersTable.can_view_all_genders,
      is_active: usersTable.is_active,
    })
    .from(usersTable)
    .where(eq(usersTable.id, authUserId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role as AppRole,
    gender: row.gender,
    can_view_all_genders: row.can_view_all_genders ?? false,
    is_active: row.is_active ?? true,
  };
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerComponentClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const db = getDb();
  if (!db) {
    return null;
  }

  return getAppUserByAuthId(db, user.id);
}

export async function requireRole(requiredRole: AppRole): Promise<AppUser> {
  const user = await getCurrentAppUser();

  if (!user || !user.is_active) {
    redirect("/login");
  }

  if (user.role !== requiredRole) {
    redirect(roleHomePath(user.role));
  }

  return user;
}
