CREATE TABLE "declaration_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_id" uuid NOT NULL,
	"declaration_date" date NOT NULL,
	"declaration_type" varchar(20) NOT NULL,
	"source_document_url" text
);
--> statement-breakpoint
ALTER TABLE "declaration_snapshots" ADD CONSTRAINT "declaration_snapshots_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE no action ON UPDATE no action;