CREATE TABLE "official_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_id" uuid NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"birth_date" date,
	"alias_key" text NOT NULL,
	"source" varchar(50) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "official_aliases_alias_key_unique" UNIQUE("alias_key")
);
--> statement-breakpoint
ALTER TABLE "official_aliases" ADD CONSTRAINT "official_aliases_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "official_aliases_official_id_idx" ON "official_aliases" USING btree ("official_id");