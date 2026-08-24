ALTER TABLE "officials" ADD COLUMN "senat_id" varchar(50);--> statement-breakpoint
ALTER TABLE "officials" ADD CONSTRAINT "officials_senat_id_unique" UNIQUE("senat_id");