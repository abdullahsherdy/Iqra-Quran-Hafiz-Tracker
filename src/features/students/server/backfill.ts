import Module from 'module';
// Mock server-only to prevent it from throwing when run via Node/tsx
try {
  const path = require.resolve('server-only');
  // @ts-expect-error — Node internal cache shape
  Module._cache[path] = {
    id: path,
    exports: {},
    loaded: true
  };
} catch {
  // ignore
}

import { getDb, closeDb } from "@/db/client";
import { studentsTable } from "@/db/schema";
import { recalculateStudentSummary } from "./recalc";

async function runBackfill() {
  const db = getDb();
  if (!db) {
    console.error("Drizzle DB client could not be created — check DATABASE_URL.");
    process.exit(1);
  }

  console.log("Fetching all students...");
  const students = await db
    .select({ id: studentsTable.id, name: studentsTable.name })
    .from(studentsTable);

  console.log(`Found ${students.length} students. Starting backfill...`);
  for (const student of students) {
    try {
      console.log(`Recalculating summary for ${student.name} (${student.id})...`);
      await recalculateStudentSummary(db, student.id);
      console.log(`Success.`);
    } catch (err) {
      console.error(`Failed for ${student.name}:`, err);
    }
  }

  console.log("Backfill complete!");
  await closeDb();
  process.exit(0);
}

runBackfill();
