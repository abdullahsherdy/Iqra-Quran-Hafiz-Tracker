/**
 * Seed the `juz_pages` table from the verified juz_pages.json dataset.
 *
 * Run with: node --env-file=.env.local scripts/seed-juz-pages.js
 *
 * The JSON file (juz_pages.json) was built from verified open datasets:
 *   - Per-page Madani mushaf layout (real line/word data from the actual print)
 *   - Ayah-level juz lookup
 * It contains 665 rows mapping each page within each juz to the exact
 * surah(s) and ayah range(s) on that page.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const jsonPath = path.join(__dirname, "..", "juz_pages.json");
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  console.log(`Loaded ${data.length} rows from juz_pages.json`);

  // Clear existing data (idempotent re-seed)
  await pool.query('DELETE FROM "juz_pages"');
  console.log("Cleared existing juz_pages data");

  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const values = [];
    const placeholders = [];
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      // Expand each row's surahs array into individual insert rows
      for (const surah of row.surahs) {
        const baseIdx = values.length;
        placeholders.push(
          `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6})`,
        );
        values.push(
          row.juz_number,
          row.page_number,
          row.mushaf_page,
          surah.surah_id,
          surah.from_ayah,
          surah.to_ayah,
        );
      }
    }
    const query = `
      INSERT INTO "juz_pages" ("juz_number", "page_number", "mushaf_page", "surah_id", "from_ayah", "to_ayah")
      VALUES ${placeholders.join(", ")}
      ON CONFLICT ("juz_number", "page_number", "surah_id") DO NOTHING
    `;
    await pool.query(query, values);
    inserted += batch.length;
    console.log(`  Inserted batch ${i / batchSize + 1} (${inserted}/${data.length} source rows)`);
  }

  // Verify
  const res = await pool.query('SELECT COUNT(*) as count FROM "juz_pages"');
  console.log(`\nTotal juz_pages rows in DB: ${res.rows[0].count}`);

  // Verify per-juz page counts
  const juzRes = await pool.query(
    'SELECT juz_number, COUNT(DISTINCT page_number) as pages FROM "juz_pages" GROUP BY juz_number ORDER BY juz_number',
  );
  for (const row of juzRes.rows) {
    console.log(`  Juz ${row.juz_number}: ${row.pages} pages`);
  }

  await pool.end();
  console.log("\nDone!");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
