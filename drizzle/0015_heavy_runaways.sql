ALTER TABLE "officials" ADD COLUMN "slug" varchar(512);--> statement-breakpoint
ALTER TABLE "officials" ADD CONSTRAINT "officials_slug_unique" UNIQUE("slug");