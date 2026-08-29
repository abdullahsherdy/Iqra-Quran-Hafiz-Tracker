// Apply migration 0006 to the live DB, atomically (single transaction).
// Reads the exact SQL from drizzle/migrations/0006_student_auth.sql and the
// DATABASE_URL from .env.local. Rolls back on any error. Additive only.
import { readFileSync } from "node:fs";
import { Client } from "pg";

function loadEnv(key) {
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

const url = loadEnv("DATABASE_URL");
const sql = readFileSync(new URL("../drizzle/migrations/0006_student_auth.sql", import.meta.url), "utf8");
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Migration 0006 applied successfully (committed).");
} catch (e) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("FAILED — rolled back. Error:", e.message);
  process.exitCode = 2;
} finally {
  await client.end();
}
