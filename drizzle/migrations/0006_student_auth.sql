-- 0006: Student self-registration + login support.
-- Adds the 'student' role, links a student data record to an auth account,
-- and widens username so a real email can be stored there for email-registered
-- users (staff still use short synthetic-email usernames).
--
-- Apply manually (Supabase SQL editor) or via `npm run db:push`, consistent
-- with 0005. The drizzle-kit snapshots are frozen at 0004; this repo authors
-- migration SQL by hand.

-- Step 1: Allow the 'student' role on the users table.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('admin', 'teacher', 'super_admin', 'student'));

-- Step 2: Widen username so a full email fits (was varchar(50)).
-- Email-registered users (students + self-registered teachers) store their
-- email as their username; staff keep short usernames.
ALTER TABLE "users" ALTER COLUMN "username" TYPE varchar(255);

-- Step 3: Link a student record to its auth/users account (self-registration).
-- Nullable: every existing/staff-created student has no login. Unique: at most
-- one student per account. ON DELETE SET NULL keeps the data record if the
-- account is removed. (A UNIQUE column allows many NULLs in Postgres.)
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_unique" UNIQUE ("user_id");
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
