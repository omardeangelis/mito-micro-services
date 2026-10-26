CREATE TYPE "public"."import_format" AS ENUM('wave', 'standard');--> statement-breakpoint
CREATE TYPE "public"."import_run_status" AS ENUM('running', 'completed', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "mito-deutsche_import_run" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_import_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"started_by" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"format" "import_format" NOT NULL,
	"status" "import_run_status" DEFAULT 'running' NOT NULL,
	"failure_reason" varchar(1000),
	"rows_total" integer NOT NULL,
	"rows_discarded" integer NOT NULL,
	"customers_created" integer,
	"customers_updated" integer,
	"practices_created" integer,
	"practices_updated" integer,
	"links_created" integer
);
--> statement-breakpoint
CREATE TABLE "mito-deutsche_import_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"format" "import_format" NOT NULL,
	"parts" integer NOT NULL,
	"run_id" integer,
	"expected" integer[]
);
--> statement-breakpoint
CREATE TABLE "mito-deutsche_import_upload_part" (
	"upload_id" uuid NOT NULL,
	"part" integer NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "mito-deutsche_import_upload_part_upload_id_part_pk" PRIMARY KEY("upload_id","part")
);
--> statement-breakpoint
ALTER TABLE "mito-deutsche_import_run" ADD CONSTRAINT "mito-deutsche_import_run_started_by_mito-deutsche_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."mito-deutsche_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mito-deutsche_import_upload" ADD CONSTRAINT "mito-deutsche_import_upload_created_by_mito-deutsche_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mito-deutsche_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mito-deutsche_import_upload" ADD CONSTRAINT "mito-deutsche_import_upload_run_id_mito-deutsche_import_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mito-deutsche_import_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mito-deutsche_import_upload_part" ADD CONSTRAINT "mito-deutsche_import_upload_part_upload_id_mito-deutsche_import_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."mito-deutsche_import_upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_run_one_running" ON "mito-deutsche_import_run" USING btree ("status") WHERE "mito-deutsche_import_run"."status" = 'running';--> statement-breakpoint
CREATE INDEX "import_run_started_at" ON "mito-deutsche_import_run" USING btree ("started_at" DESC NULLS LAST);