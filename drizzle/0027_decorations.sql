CREATE TABLE "decorations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_id" uuid,
	"last_name" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"sex" varchar(10),
	"birth_date" date,
	"death_date" date,
	"birth_place" varchar(512),
	"order_name" varchar(255) NOT NULL,
	"grade" varchar(255) NOT NULL,
	"decree_date" date,
	"journal_officiel_date" date,
	"ministry" varchar(512),
	"quality" varchar(512),
	"arko_ref" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decorations" ADD CONSTRAINT "decorations_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decorations_arko_ref_order_idx" ON "decorations" USING btree ("arko_ref","order_name");