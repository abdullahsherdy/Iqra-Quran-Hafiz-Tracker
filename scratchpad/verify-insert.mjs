// Verification: exercise the EXACT student-registration insert (users + students)
// that was failing, inside a transaction, then ROLL BACK. Proves the schema now
// accepts it without persisting any row. Uses a random uuid + throwaway email.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

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

const pg = new Client({ connectionString: env("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
const id = randomUUID();
const email = `__verify_${id}@example.test`;

try {
  await pg.connect();
  await pg.query("BEGIN");
  await pg.query(
    `INSERT INTO users (id, name, username, role, gender, is_active) VALUES ($1,$2,$3,'student',$4,true)`,
    [id, "اختبار", email, "male"]
  );
  await pg.query(
    `INSERT INTO students (user_id, name, gender, guardian_name, guardian_phone, enrollment_date)
     VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
    [id, "اختبار", "male", "ولي الأمر", "01000000000"]
  );
  await pg.query("ROLLBACK"); // never persist
  console.log("PASS: student registration insert (users + students) now succeeds. Rolled back — nothing persisted.");
} catch (e) {
  try { await pg.query("ROLLBACK"); } catch {}
  console.error("FAIL: insert still errors ->", e.message);
  process.exitCode = 2;
} finally {
  await pg.end();
}
