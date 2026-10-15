CREATE TABLE "video_short_ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_short_id" uuid NOT NULL,
	"ballot_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_shorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'candidate' NOT NULL,
	"score" integer NOT NULL,
	"score_details" jsonb,
	"script" jsonb,
	"video_key" varchar(512),
	"thumbnail_key" varchar(512),
	"youtube_video_id" varchar(32),
	"notes" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_short_ballots" ADD CONSTRAINT "video_short_ballots_video_short_id_video_shorts_id_fk" FOREIGN KEY ("video_short_id") REFERENCES "public"."video_shorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_short_ballots" ADD CONSTRAINT "video_short_ballots_ballot_id_ballots_id_fk" FOREIGN KEY ("ballot_id") REFERENCES "public"."ballots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_short_ballots_short_ballot_idx" ON "video_short_ballots" USING btree ("video_short_id","ballot_id");