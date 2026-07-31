import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

/**
 * Drizzle query client for the Iqra Postgres database (Supabase).
 *
 * Talks DIRECTLY to Postgres via the `pg` driver using the service-role
 * connection — it BYPASSES Supabase's API layer and PostgREST, and therefore
 * bypasses RLS. This is intentional and matches the existing pattern: the app
 * enforces row-level scoping (teacher assignments, gender scoping, admin vs.
 * teacher) in application code (see src/lib/auth/student-access.ts). RLS
 * remains as a second defense layer for direct Supabase SDK / JWT access.
 *
 * Server-only: uses the `pg` Node driver and `server-only`, so it cannot run
 * in the browser or at the edge (proxy.ts). Auth + edge session refresh still
 * use the Supabase JS SDK (src/lib/supabase/*).
 *
 * Connection string resolution:
 *   DATABASE_URL  — Postgres URL. Prefer the Supabase Supavisor POOLER
 *   (IPv4, port 6543) over the direct db.* host (IPv6-only, often
 *   unreachable). Find it in Supabase Dashboard → Connect → Transaction
 *   pooler. e.g.
 *   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 *
 * Returns null when env vars are missing — every caller must null-check and
 * return a 500/config error, mirroring the Supabase client factories.
 */

let pool: Pool | null = null;
let client: ReturnType<typeof drizzle> | null = null;

function resolveDatabaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() ?? null;
}

export function getDb() {
  if (client) return client;

  const connectionString = resolveDatabaseUrl();
  if (!connectionString) return null;

  pool = new Pool({
    connectionString,
    // Supabase requires SSL. The pooler uses SNI, so don't pin a hostname.
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  client = drizzle(pool, { schema });
  return client;
}

export type Db = NonNullable<ReturnType<typeof getDb>>;

/**
 * For CLI scripts (backfill, etc.) that need to drain the pool on exit.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    client = null;
  }
}
