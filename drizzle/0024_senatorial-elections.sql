CREATE TABLE "senatorial_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"nom" varchar(200) NOT NULL,
	"prenom" varchar(200) NOT NULL,
	"sexe" varchar(2),
	"nuance" varchar(20),
	"voix" integer NOT NULL,
	"ratio_exprimes" real,
	"elected" boolean NOT NULL,
	"official_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "senatorial_elections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_year" varchar(4) NOT NULL,
	"departement_code" varchar(5) NOT NULL,
	"departement_name" varchar(200),
	"scrutin_type" varchar(20) NOT NULL,
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
ALTER TABLE "senatorial_candidates" ADD CONSTRAINT "senatorial_candidates_election_id_senatorial_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."senatorial_elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "senatorial_candidates_election_name_idx" ON "senatorial_candidates" USING btree ("election_id","nom","prenom");--> statement-breakpoint
CREATE UNIQUE INDEX "senatorial_elections_year_dept_round_idx" ON "senatorial_elections" USING btree ("election_year","departement_code","round");