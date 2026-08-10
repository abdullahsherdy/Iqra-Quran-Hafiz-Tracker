import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * `db:generate` (drizzle-kit generate) creates migration SQL snapshots from
 * src/db/schema.ts. `db:push` (drizzle-kit push) diffs schema.ts against the
 * live DB and applies the changes directly. `db:studio` opens a visual
 * explorer.
 *
 * The connection string is read from DATABASE_URL (preferred) or constructed
 * from NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD — see src/db/client.ts.
 */
function resolveDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (supabaseUrl && dbPassword) {
    const host = supabaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    return `postgresql://postgres:${encodeURIComponent(dbPassword)}@${host}:5432/postgres`;
  }

  // drizzle-kit requires a non-empty string; placeholder so config loads even
  // without env (generate works offline; push will fail clearly without creds).
  return "postgresql://placeholder:placeholder@localhost:5432/postgres";
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
  verbose: true,
  strict: true,
});
