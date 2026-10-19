DO $$ BEGIN
 CREATE TYPE "public"."cron_run_status" AS ENUM('running', 'succeeded', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_cron_run" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_cron_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job" varchar(64) NOT NULL,
	"run_day" date NOT NULL,
	"status" "cron_run_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"finished_at" timestamp with time zone,
	"counters" jsonb,
	CONSTRAINT "cron_run_job_day" UNIQUE("job","run_day")
);