CREATE TABLE "madada_requests" (
	"madada_id" integer PRIMARY KEY NOT NULL,
	"commune_code" varchar(10) NOT NULL,
	"url_title" varchar(512) NOT NULL,
	"title" varchar(1024) NOT NULL,
	"status" varchar(100) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX "madada_requests_commune_created_idx" ON "madada_requests" USING btree ("commune_code","created_at");
