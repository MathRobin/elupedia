ALTER TABLE "senatorial_candidates" ALTER COLUMN "nuance" SET DATA TYPE varchar(150);--> statement-breakpoint
ALTER TABLE "senatorial_candidates" ALTER COLUMN "voix" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_candidates" ALTER COLUMN "elected" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ALTER COLUMN "inscrits" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ALTER COLUMN "abstentions" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ALTER COLUMN "votants" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ALTER COLUMN "blancs" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ALTER COLUMN "nuls" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ALTER COLUMN "exprimes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "officials" ADD COLUMN "press_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "officials" ADD COLUMN "factchecks_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "parliamentary_activity" ADD COLUMN "source" varchar(30) NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_candidates" ADD COLUMN "liste" varchar(500);--> statement-breakpoint
ALTER TABLE "senatorial_candidates" ADD COLUMN "sortant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ADD COLUMN "sieges_a_pourvoir" integer;--> statement-breakpoint
ALTER TABLE "senatorial_elections" ADD COLUMN "electeurs_senatoriaux" integer;--> statement-breakpoint
CREATE INDEX "press_mentions_official_source_idx" ON "press_mentions" USING btree ("official_id","source_url");