# Legacy SQL Files

These SQL files were the original schema management approach before Drizzle ORM
was introduced. They are kept here for reference and for one-time setup on a
fresh Supabase project.

## Files

- **`schema.sql`** — Original full schema (all tables, indexes, constraints).
  Now superseded by `src/db/schema.ts` (Drizzle). Migrations are generated via
  `npm run db:generate` and stored in `drizzle/migrations/`.
- **`rls.sql`** — Row-Level Security policies. Drizzle does not manage RLS,
  so these must still be applied manually once per Supabase project.
- **`seed.sql`** — Fixed reference data: 114 surahs and 30 juz boundaries.
  Apply once on a fresh database. This data is required by the progress engine.

## Fresh Database Setup

1. Apply `schema.sql` in the Supabase SQL editor (creates all tables).
2. Apply the Drizzle migrations in `drizzle/migrations/` (adds columns added
   after the initial schema: `attendance.recorded_manually`, `students.status_since`,
   `attendance.status` enum expansion, etc.). Or run `npm run db:push` to diff
   the Drizzle schema against the live DB.
3. Apply `rls.sql` (RLS policies — not managed by Drizzle).
4. Apply `seed.sql` (surahs + juz boundaries reference data).

## For Existing Databases

No action needed — the live DB is already up to date. The Drizzle schema in
`src/db/schema.ts` reflects the current state of the live DB.
