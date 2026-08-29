// Read-only: find orphaned auth users (exist in Supabase Auth but have no
// matching public.users row) — i.e. debris from a failed registration whose
// rollback didn't complete. Prints them; deletes nothing.
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

function env(key) {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && m[1] === key) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  return null;
}

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const pg = new Client({ connectionString: env("DATABASE_URL"), ssl: { rejectUnauthorized: false } });

try {
  await pg.connect();
  const appUsers = await pg.query("SELECT id FROM users");
  const appIds = new Set(appUsers.rows.map((r) => r.id));

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const authUsers = data.users;
  const orphans = authUsers.filter((u) => !appIds.has(u.id));

  console.log(`Auth users total: ${authUsers.length}`);
  console.log(`public.users rows: ${appIds.size}`);
  console.log(`Orphans (auth user, NO public.users row): ${orphans.length}\n`);

  for (const u of orphans) {
    console.log(
      `- id=${u.id}\n  email=${u.email}\n  confirmed=${u.email_confirmed_at ? "yes" : "NO"}` +
      `\n  created=${u.created_at}\n  role(meta)=${u.user_metadata?.role ?? "?"}`
    );
  }
  if (orphans.length === 0) console.log("(No orphans — rollback succeeded; just re-register.)");
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 2;
} finally {
  await pg.end();
}
