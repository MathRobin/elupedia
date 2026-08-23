ALTER TABLE "external_links" ADD COLUMN "source" varchar(50) DEFAULT 'official' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_links" ADD COLUMN "captured_at" date;