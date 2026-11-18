CREATE TABLE "europarl_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_id" uuid NOT NULL,
	"sitting_date" date NOT NULL,
	"pv_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "europarl_attendance" ADD CONSTRAINT "europarl_attendance_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "europarl_attendance_official_sitting_idx" ON "europarl_attendance" USING btree ("official_id","sitting_date");--> statement-breakpoint
CREATE INDEX "europarl_attendance_sitting_date_idx" ON "europarl_attendance" USING btree ("sitting_date");