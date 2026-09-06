CREATE TABLE "ballot_group_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ballot_id" uuid NOT NULL,
	"organe_ref" varchar(50) NOT NULL,
	"group_name" varchar(255) NOT NULL,
	"position" varchar(20) NOT NULL,
	"member_count" integer,
	"votes_for" integer DEFAULT 0 NOT NULL,
	"votes_against" integer DEFAULT 0 NOT NULL,
	"votes_abstain" integer DEFAULT 0 NOT NULL,
	"votes_absent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ballot_group_positions" ADD CONSTRAINT "ballot_group_positions_ballot_id_ballots_id_fk" FOREIGN KEY ("ballot_id") REFERENCES "public"."ballots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ballot_group_positions_ballot_organe_idx" ON "ballot_group_positions" USING btree ("ballot_id","organe_ref");