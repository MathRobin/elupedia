CREATE TABLE "campaign_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_id" uuid,
	"cnccfp_id" varchar(20) NOT NULL,
	"candidate_name" varchar(500) NOT NULL,
	"election_type" varchar(50) NOT NULL,
	"election_date" date NOT NULL,
	"constituency" varchar(500),
	"department" varchar(255),
	"department_code" varchar(10),
	"political_label" varchar(255),
	"expenses_declared" integer,
	"expenses_retained" integer,
	"revenue_declared" integer,
	"revenue_retained" integer,
	"donations_declared" integer,
	"donations_retained" integer,
	"personal_contribution_declared" integer,
	"personal_contribution_retained" integer,
	"party_contributions_declared" integer,
	"party_contributions_retained" integer,
	"reimbursement" integer,
	"decision" varchar(10) NOT NULL,
	CONSTRAINT "campaign_accounts_cnccfp_id_unique" UNIQUE("cnccfp_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_accounts" ADD CONSTRAINT "campaign_accounts_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE no action ON UPDATE no action;