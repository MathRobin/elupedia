CREATE TABLE "legislative_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"panneau" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"prenom" varchar(200) NOT NULL,
	"sexe" varchar(2),
	"nuance" varchar(20),
	"voix" integer NOT NULL,
	"ratio_inscrits" real,
	"ratio_exprimes" real,
	"official_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legislative_elections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" varchar(30) NOT NULL,
	"departement_code" varchar(5) NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "legislative_candidates" ADD CONSTRAINT "legislative_candidates_election_id_legislative_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."legislative_elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legislative_candidates_election_panneau_idx" ON "legislative_candidates" USING btree ("election_id","panneau");--> statement-breakpoint
CREATE UNIQUE INDEX "legislative_elections_election_commune_idx" ON "legislative_elections" USING btree ("election_id","commune_code");
