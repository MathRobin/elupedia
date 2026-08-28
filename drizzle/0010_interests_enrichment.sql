ALTER TABLE "interests" ADD COLUMN "declarant_comment" text;--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "source_document_url" text;--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "ownership_detail" text;--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "annual_amount" numeric;--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "amount_year" integer;--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "amount_is_net" boolean;