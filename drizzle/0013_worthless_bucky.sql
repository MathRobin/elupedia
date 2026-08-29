ALTER TABLE "parliamentary_activity" ADD COLUMN "rubrique" varchar(255);--> statement-breakpoint
ALTER TABLE "parliamentary_activity" ADD COLUMN "tete_analyse" varchar(512);--> statement-breakpoint
ALTER TABLE "parliamentary_activity" ADD COLUMN "question_number" integer;