-- Tables et index municipaux : présents dans les snapshots (0023 et suivants) et en prod,
-- mais absents de toute migration SQL. Idempotent : sans effet sur une base qui les a déjà.
-- Index mandates_official_type_start_idx : même cas.

CREATE TABLE IF NOT EXISTS "municipal_elections" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
	"election_id" varchar(30) NOT NULL,
	"commune_code" varchar(10) NOT NULL,
	"commune_name" varchar(200),
	"round" integer NOT NULL,
	"election_date" date NOT NULL,
	"inscrits" integer NOT NULL,
	"abstentions" integer NOT NULL,
	"votants" integer NOT NULL,
	"blancs" integer NOT NULL,
	"nuls" integer NOT NULL,
	"exprimes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "municipal_candidates" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
	"election_id" uuid NOT NULL,
	"panneau" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"prenom" varchar(200) NOT NULL,
	"sexe" varchar(2),
	"nuance" varchar(20),
	"liste" varchar(500),
	"voix" integer NOT NULL,
	"ratio_inscrits" real,
	"ratio_exprimes" real,
	"official_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "municipal_elections_election_commune_idx" ON "municipal_elections" USING btree ("election_id","commune_code");
CREATE UNIQUE INDEX IF NOT EXISTS "municipal_candidates_election_panneau_idx" ON "municipal_candidates" USING btree ("election_id","panneau");

DO $$ BEGIN
	ALTER TABLE "municipal_candidates" ADD CONSTRAINT "municipal_candidates_election_id_municipal_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."municipal_elections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "mandates_official_type_start_idx" ON "mandates" USING btree ("official_id","type","start_date");
