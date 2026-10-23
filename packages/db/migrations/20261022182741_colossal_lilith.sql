ALTER TYPE "public"."task_event_source" ADD VALUE 'deactivation';--> statement-breakpoint
ALTER TABLE "mito-deutsche_user" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mito-deutsche_user" ADD COLUMN "disabled_by" integer;--> statement-breakpoint
ALTER TABLE "mito-deutsche_user" ADD CONSTRAINT "mito-deutsche_user_disabled_by_mito-deutsche_operator_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;