DO $$ BEGIN
 CREATE TYPE "public"."task_status" AS ENUM('chiamare', 'non interessato', 'app.to', 'caricato', 'richiamare', 'erogata', 'nessuno', 'followup');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."task_event_action" AS ENUM('state_change', 'operator_reassign', 'alert_resolved');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."task_event_source" AS ENUM('detail', 'list', 'bulk', 'self_assign', 'cron_alert');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_task_event_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_task_event_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"customer_id" varchar NOT NULL,
	"task_id" integer,
	"alert_id" integer,
	"actor_operator_id" integer NOT NULL,
	"action" "task_event_action" NOT NULL,
	"source" "task_event_source" NOT NULL,
	"from_state" "task_status",
	"to_state" "task_status",
	"from_operator_id" integer,
	"to_operator_id" integer
);
--> statement-breakpoint
ALTER TABLE "mito-deutsche_customers" ALTER COLUMN "id" SET DEFAULT 'ptA-09WKZ8P-5e2GGLbKN';--> statement-breakpoint
ALTER TABLE "mito-deutsche_alert" ADD COLUMN "resolved_by" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task_event_log" ADD CONSTRAINT "mito-deutsche_task_event_log_customer_id_mito-deutsche_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mito-deutsche_customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task_event_log" ADD CONSTRAINT "mito-deutsche_task_event_log_task_id_mito-deutsche_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."mito-deutsche_task"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task_event_log" ADD CONSTRAINT "mito-deutsche_task_event_log_alert_id_mito-deutsche_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."mito-deutsche_alert"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task_event_log" ADD CONSTRAINT "mito-deutsche_task_event_log_actor_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("actor_operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task_event_log" ADD CONSTRAINT "mito-deutsche_task_event_log_from_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("from_operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task_event_log" ADD CONSTRAINT "mito-deutsche_task_event_log_to_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("to_operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_event_log_customerId_idx" ON "mito-deutsche_task_event_log" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_event_log_createdAt_idx" ON "mito-deutsche_task_event_log" USING btree ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_alert" ADD CONSTRAINT "mito-deutsche_alert_resolved_by_mito-deutsche_operator_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
