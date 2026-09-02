CREATE TABLE "sponsorships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_id" uuid,
	"type" varchar(50) NOT NULL,
	"election_year" integer NOT NULL,
	"candidate_name" varchar(255) NOT NULL,
	"raw_elected_name" varchar(255) NOT NULL,
	"raw_function" varchar(255) NOT NULL,
	"raw_circumscription" varchar(255),
	"raw_department" varchar(255),
	"publication_date" date,
	"matched" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE no action ON UPDATE no action;