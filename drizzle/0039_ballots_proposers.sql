ALTER TABLE "ballots" ADD COLUMN "dossier_ref" varchar(50);--> statement-breakpoint
ALTER TABLE "ballots" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "ballots" ADD COLUMN "proposers" jsonb;