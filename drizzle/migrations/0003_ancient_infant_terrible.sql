CREATE TABLE "juz_pages" (
	"juz_number" integer NOT NULL,
	"page_number" integer NOT NULL,
	"mushaf_page" integer NOT NULL,
	"surah_id" integer NOT NULL,
	"from_ayah" integer NOT NULL,
	"to_ayah" integer NOT NULL,
	CONSTRAINT "juz_pages_juz_number_page_number_surah_id_pk" PRIMARY KEY("juz_number","page_number","surah_id"),
	CONSTRAINT "juz_pages_juz_number_check" CHECK ("juz_pages"."juz_number" BETWEEN 1 AND 30),
	CONSTRAINT "juz_pages_page_number_check" CHECK ("juz_pages"."page_number" BETWEEN 1 AND 23),
	CONSTRAINT "juz_pages_valid_ayah_range" CHECK ("juz_pages"."from_ayah" <= "juz_pages"."to_ayah")
);
--> statement-breakpoint
ALTER TABLE "initial_memorization" DROP CONSTRAINT "initial_memorization_pages_check";--> statement-breakpoint
ALTER TABLE "juz_pages" ADD CONSTRAINT "juz_pages_surah_id_surahs_id_fk" FOREIGN KEY ("surah_id") REFERENCES "public"."surahs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_juz_pages_juz" ON "juz_pages" USING btree ("juz_number","page_number");--> statement-breakpoint
ALTER TABLE "initial_memorization" ADD CONSTRAINT "initial_memorization_pages_check" CHECK ("initial_memorization"."pages" IS NULL OR ("initial_memorization"."pages" BETWEEN 1 AND 23));