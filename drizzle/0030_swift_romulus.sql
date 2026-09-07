CREATE TABLE "commune_transparency" (
	"commune_code" varchar(10) PRIMARY KEY NOT NULL,
	"madada_url_name" varchar(255) NOT NULL,
	"requests_count" integer DEFAULT 0 NOT NULL,
	"requests_successful" integer DEFAULT 0 NOT NULL,
	"requests_overdue" integer DEFAULT 0 NOT NULL,
	"requests_not_held" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_id" uuid NOT NULL,
	"claim_reviewed" text NOT NULL,
	"review_url" varchar(2048) NOT NULL,
	"reviewer_name" varchar(255) NOT NULL,
	"reviewer_url" varchar(2048),
	"rating" varchar(100),
	"date_published" date,
	"language_code" varchar(10) DEFAULT 'fr' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fact_checks" ADD CONSTRAINT "fact_checks_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commune_transparency_madada_idx" ON "commune_transparency" USING btree ("madada_url_name");