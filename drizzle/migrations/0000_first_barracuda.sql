CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid,
	"attendance_date" date NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "attendance_status_check" CHECK ("attendance"."status" IN ('present', 'absent'))
);
--> statement-breakpoint
CREATE TABLE "ijazat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"ijaza_type" text NOT NULL,
	"juz_number" integer,
	"sheikh_name" varchar(100) NOT NULL,
	"ijaza_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ijazat_ijaza_type_check" CHECK ("ijazat"."ijaza_type" IN ('juz', 'full_quran')),
	CONSTRAINT "ijazat_juz_number_check" CHECK ("ijazat"."juz_number" IS NULL OR "ijazat"."juz_number" BETWEEN 1 AND 30),
	CONSTRAINT "juz_required_if_type" CHECK (("ijazat"."ijaza_type" = 'juz' AND "ijazat"."juz_number" IS NOT NULL) OR ("ijazat"."ijaza_type" = 'full_quran' AND "ijazat"."juz_number" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "initial_memorization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"juz_number" integer NOT NULL,
	"status" text NOT NULL,
	"sheikh_name" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "initial_memorization_juz_number_check" CHECK ("initial_memorization"."juz_number" BETWEEN 1 AND 30),
	CONSTRAINT "initial_memorization_status_check" CHECK ("initial_memorization"."status" IN ('memorized', 'with_ijaza'))
);
--> statement-breakpoint
CREATE TABLE "juz_boundaries" (
	"juz_number" integer NOT NULL,
	"surah_id" integer NOT NULL,
	"from_ayah" integer NOT NULL,
	"to_ayah" integer NOT NULL,
	CONSTRAINT "juz_boundaries_juz_number_surah_id_pk" PRIMARY KEY("juz_number","surah_id"),
	CONSTRAINT "juz_boundaries_juz_number_check" CHECK ("juz_boundaries"."juz_number" BETWEEN 1 AND 30),
	CONSTRAINT "valid_juz_range" CHECK ("juz_boundaries"."from_ayah" <= "juz_boundaries"."to_ayah")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"session_type" text NOT NULL,
	"surah_id" integer NOT NULL,
	"from_ayah" integer NOT NULL,
	"to_ayah" integer NOT NULL,
	"rating" text NOT NULL,
	"pages" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sessions_session_type_check" CHECK ("sessions"."session_type" IN ('new_memorization', 'review')),
	CONSTRAINT "sessions_rating_check" CHECK ("sessions"."rating" IN ('excellent', 'good', 'weak')),
	CONSTRAINT "sessions_pages_check" CHECK ("sessions"."pages" IS NULL OR "sessions"."pages" >= 0),
	CONSTRAINT "sessions_valid_ayah_range" CHECK ("sessions"."from_ayah" <= "sessions"."to_ayah")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"gender" text NOT NULL,
	"birth_date" date,
	"guardian_name" varchar(100) NOT NULL,
	"guardian_phone" varchar(20) NOT NULL,
	"enrollment_date" date DEFAULT CURRENT_DATE NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"memorized_juz_count" smallint DEFAULT 0 NOT NULL,
	"ijaza_juz_count" smallint DEFAULT 0 NOT NULL,
	"last_session_date" date,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "students_gender_check" CHECK ("students"."gender" IN ('male', 'female')),
	CONSTRAINT "students_status_check" CHECK ("students"."status" IN ('active', 'paused', 'graduated', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "surahs" (
	"id" integer PRIMARY KEY NOT NULL,
	"name_arabic" varchar(50) NOT NULL,
	"juz_number" integer NOT NULL,
	"total_ayahs" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_student_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"start_date" date DEFAULT CURRENT_DATE NOT NULL,
	"end_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"username" varchar(50) NOT NULL,
	"role" text NOT NULL,
	"phone" varchar(20),
	"gender" text,
	"can_view_all_genders" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('admin', 'teacher')),
	CONSTRAINT "users_gender_check" CHECK ("users"."gender" IS NULL OR "users"."gender" IN ('male', 'female'))
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ijazat" ADD CONSTRAINT "ijazat_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ijazat" ADD CONSTRAINT "ijazat_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initial_memorization" ADD CONSTRAINT "initial_memorization_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "juz_boundaries" ADD CONSTRAINT "juz_boundaries_surah_id_surahs_id_fk" FOREIGN KEY ("surah_id") REFERENCES "public"."surahs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_surah_id_surahs_id_fk" FOREIGN KEY ("surah_id") REFERENCES "public"."surahs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_student_assignments" ADD CONSTRAINT "teacher_student_assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_student_assignments" ADD CONSTRAINT "teacher_student_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_student_assignments" ADD CONSTRAINT "teacher_student_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attendance_student_date" ON "attendance" USING btree ("student_id","attendance_date");--> statement-breakpoint
CREATE UNIQUE INDEX "initial_memorization_student_id_juz_number_key" ON "initial_memorization" USING btree ("student_id","juz_number");--> statement-breakpoint
CREATE INDEX "idx_sessions_student" ON "sessions" USING btree ("student_id","session_date");--> statement-breakpoint
CREATE INDEX "idx_sessions_teacher" ON "sessions" USING btree ("teacher_id","session_date");--> statement-breakpoint
CREATE INDEX "idx_students_gender" ON "students" USING btree ("gender");--> statement-breakpoint
CREATE INDEX "idx_students_status" ON "students" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_students_juzcount" ON "students" USING btree ("memorized_juz_count");--> statement-breakpoint
CREATE INDEX "idx_students_ijazacount" ON "students" USING btree ("ijaza_juz_count");--> statement-breakpoint
CREATE INDEX "idx_students_lastsession" ON "students" USING btree ("last_session_date");--> statement-breakpoint
CREATE INDEX "idx_students_birthdate" ON "students" USING btree ("birth_date");--> statement-breakpoint
CREATE INDEX "idx_students_enrollment" ON "students" USING btree ("enrollment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_active_assignment" ON "teacher_student_assignments" USING btree ("teacher_id","student_id") WHERE end_date IS NULL;--> statement-breakpoint
CREATE INDEX "idx_active_assignments" ON "teacher_student_assignments" USING btree ("student_id") WHERE end_date IS NULL;