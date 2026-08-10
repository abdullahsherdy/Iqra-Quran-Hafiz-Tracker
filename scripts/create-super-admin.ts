/**
 * One-off script to create the super admin account.
 *
 * Usage:
 *   npx tsx scripts/create-super-admin.ts
 *
 * Requires env vars: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Credentials created:
 *   Username: abo_seif
 *   Password: AboSeif@Admin2026
 *   Name:     محمد سيف
 *   Role:     super_admin
 */

import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";

// Load .env.local manually (dotenv not installed)
const envPath = join(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

import { usersTable } from "../src/db/schema";

const NAME = "محمد سيف";
const USERNAME = "abo_seif";
const PASSWORD = "AboSeif@Admin2026";
const ROLE = "super_admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const authEmailDomain = process.env.AUTH_EMAIL_DOMAIN?.trim() || "noor-al-eman.local";

if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  console.error("Missing required env vars. Check .env.local");
  process.exit(1);
}

async function main() {
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pool = new Pool({
    connectionString: databaseUrl!,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  // Check if user already exists
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, USERNAME))
    .limit(1);

  if (existing) {
    console.log(`User '${USERNAME}' already exists with role '${existing.role}'. Updating to super_admin...`);
    await db
      .update(usersTable)
      .set({ role: ROLE, is_active: true })
      .where(eq(usersTable.id, existing.id));
    console.log("Updated successfully.");
    await pool.end();
    return;
  }

  const email = `${USERNAME}@${authEmailDomain}`;

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("Failed to create auth user:", authError?.message);
    await pool.end();
    process.exit(1);
  }

  // Insert users row
  try {
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: authData.user.id,
        name: NAME,
        username: USERNAME,
        role: ROLE,
        is_active: true,
      })
      .returning();

    console.log("Super admin created successfully!");
    console.log(`  ID:       ${newUser.id}`);
    console.log(`  Name:     ${newUser.name}`);
    console.log(`  Username: ${newUser.username}`);
    console.log(`  Role:     ${newUser.role}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${PASSWORD}`);
  } catch (err) {
    console.error("Failed to insert user row, rolling back auth user:", err);
    await admin.auth.admin.deleteUser(authData.user.id);
    await pool.end();
    process.exit(1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
