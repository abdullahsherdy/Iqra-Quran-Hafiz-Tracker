import Module from 'module';
// Mock server-only to prevent it from throwing when run via Node/tsx
try {
  const path = require.resolve('server-only');
  // @ts-ignore
  Module._cache[path] = {
    id: path,
    exports: {},
    loaded: true
  };
} catch (e) {
  // ignore
}

import { createSupabaseAdminClient } from "./supabase/admin";
import { recalculateStudentSummary } from "./students";

async function runBackfill() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error("Supabase Admin Client could not be created.");
    process.exit(1);
  }

  console.log("Fetching all students...");
  const { data: students, error } = await admin
    .from("students")
    .select("id, name");

  if (error) {
    console.error("Error fetching students:", error);
    process.exit(1);
  }

  console.log(`Found ${students.length} students. Starting backfill...`);
  for (const student of students) {
    try {
      console.log(`Recalculating summary for ${student.name} (${student.id})...`);
      await recalculateStudentSummary(admin, student.id);
      console.log(`Success.`);
    } catch (err) {
      console.error(`Failed for ${student.name}:`, err);
    }
  }

  console.log("Backfill complete!");
  process.exit(0);
}

runBackfill();
