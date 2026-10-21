CREATE INDEX IF NOT EXISTS "alert_task_id_idx" ON "mito-deutsche_alert" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_customer_active_uidx" ON "mito-deutsche_task" USING btree ("customer_id") WHERE is_active;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_customer_id_idx" ON "mito-deutsche_task" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_operator_active_idx" ON "mito-deutsche_task" USING btree ("operator_id") WHERE is_active;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_priority_active_idx" ON "mito-deutsche_task" USING btree ("priority" DESC NULLS LAST) WHERE is_active;