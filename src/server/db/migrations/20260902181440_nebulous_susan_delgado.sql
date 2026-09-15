CREATE INDEX IF NOT EXISTS "customers_file_name_idx" ON "mito-deutsche_customers" USING btree ("file_name","last_import_update" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practices_file_name_idx" ON "mito-deutsche_practices" USING btree ("file_name","last_import_update" DESC NULLS LAST);
