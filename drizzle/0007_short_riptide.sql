ALTER TABLE "interests" ADD COLUMN "category" varchar(50);--> statement-breakpoint
UPDATE "interests" SET "category" = 'financial_participation' WHERE "type" = 'company_share';--> statement-breakpoint
UPDATE "interests" SET "category" = 'voluntary_activity' WHERE "type" = 'nonprofit_role';--> statement-breakpoint
UPDATE "interests" SET "category" = 'financial_participation' WHERE "category" IS NULL;--> statement-breakpoint
ALTER TABLE "interests" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "end_date" date;
