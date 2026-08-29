// Read-only diagnostic: is migration 0006 applied to the live DB?
// Reads DATABASE_URL from .env.local directly (tsx/node don't auto-load it),
// connects via pg, and introspects the users/students schema. No writes.
import { readFileSync } from "node:fs";
import { Client } from "pg";

function loadEnv(key) {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && m[1] === key) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

const url = loadEnv("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const roleCheck = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE conname = 'users_role_check'`
  );
  const usernameCol = await client.query(
    `SELECT data_type, character_maximum_length
       FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'username'`
  );
  const userIdCol = await client.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'students' AND column_name = 'user_id'`
  );

  console.log("=== users_role_check ===");
  console.log(roleCheck.rows[0]?.def ?? "(constraint not found)");
  const includesStudent = (roleCheck.rows[0]?.def ?? "").includes("student");
  console.log("includes 'student'? ->", includesStudent);

  console.log("\n=== users.username ===");
  const uc = usernameCol.rows[0];
  console.log(uc ? `${uc.data_type}(${uc.character_maximum_length})` : "(column not found)");
  console.log("widened to >= 255? ->", (uc?.character_maximum_length ?? 0) >= 255);

  console.log("\n=== students.user_id ===");
  console.log(userIdCol.rows[0] ?? "(column MISSING)");
  console.log("exists? ->", userIdCol.rows.length > 0);

  console.log("\n=== VERDICT ===");
  const applied = includesStudent && (uc?.character_maximum_length ?? 0) >= 255 && userIdCol.rows.length > 0;
  console.log(applied ? "Migration 0006 IS applied." : "Migration 0006 is NOT (fully) applied.");
} catch (e) {
  console.error("DB error:", e.message);
  process.exitCode = 2;
} finally {
  await client.end();
}
