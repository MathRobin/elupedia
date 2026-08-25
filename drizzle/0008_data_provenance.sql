CREATE TABLE IF NOT EXISTS "data_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_table" text NOT NULL,
	"source_record_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"legal_basis" text NOT NULL,
	"raw_data" jsonb,
	"fetched_at" timestamp with time zone NOT NULL
);
