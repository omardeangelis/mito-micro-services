CREATE TYPE "public"."alert_resolution" AS ENUM('call', 'replaced', 'removed', 'state_change', 'bulk', 'system');--> statement-breakpoint
CREATE TYPE "public"."call_origin" AS ENUM('alert', 'list');--> statement-breakpoint
ALTER TYPE "public"."task_event_action" ADD VALUE 'call';--> statement-breakpoint
CREATE TABLE "mito-deutsche_app_milestone" (
	"name" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mito-deutsche_task" ALTER COLUMN "state" SET DEFAULT 'chiamare';--> statement-breakpoint
ALTER TABLE "mito-deutsche_alert" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mito-deutsche_alert" ADD COLUMN "resolution" "alert_resolution";--> statement-breakpoint
ALTER TABLE "mito-deutsche_task_event_log" ADD COLUMN "outcome" "task_status";--> statement-breakpoint
ALTER TABLE "mito-deutsche_task_event_log" ADD COLUMN "origin" "call_origin";--> statement-breakpoint
ALTER TABLE "mito-deutsche_task_event_log" ADD COLUMN "request_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "task_event_log_request_id_uidx" ON "mito-deutsche_task_event_log" USING btree ("request_id") WHERE request_id IS NOT NULL;
