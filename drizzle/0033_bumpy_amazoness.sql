ALTER TABLE "affiliations" ADD COLUMN "kind" varchar(50) DEFAULT 'group' NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "legislature" integer;--> statement-breakpoint
ALTER TABLE "officials" ADD COLUMN "europarl_id" varchar(50);--> statement-breakpoint
ALTER TABLE "officials" ADD CONSTRAINT "officials_europarl_id_unique" UNIQUE("europarl_id");