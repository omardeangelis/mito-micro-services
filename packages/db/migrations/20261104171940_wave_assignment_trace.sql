CREATE TYPE "public"."wave_operation_kind" AS ENUM('assign', 'move');--> statement-breakpoint
CREATE TABLE "mito-deutsche_import_run_customer" (
	"run_id" integer NOT NULL,
	"customer_id" varchar NOT NULL,
	"created" boolean,
	CONSTRAINT "mito-deutsche_import_run_customer_run_id_customer_id_pk" PRIMARY KEY("run_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "mito-deutsche_wave_operation" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"kind" "wave_operation_kind" NOT NULL,
	"actor_operator_id" integer NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
ALTER TABLE "mito-deutsche_import_run" ADD COLUMN "deadline" date;--> statement-breakpoint
ALTER TABLE "mito-deutsche_import_run_customer" ADD CONSTRAINT "mito-deutsche_import_run_customer_run_id_mito-deutsche_import_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mito-deutsche_import_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mito-deutsche_import_run_customer" ADD CONSTRAINT "mito-deutsche_import_run_customer_customer_id_mito-deutsche_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mito-deutsche_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mito-deutsche_wave_operation" ADD CONSTRAINT "mito-deutsche_wave_operation_run_id_mito-deutsche_import_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mito-deutsche_import_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mito-deutsche_wave_operation" ADD CONSTRAINT "mito-deutsche_wave_operation_actor_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("actor_operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_run_customer_customer_id_idx" ON "mito-deutsche_import_run_customer" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "task_operator_id_active_idx" ON "mito-deutsche_task" USING btree ("operator_id") WHERE is_active;
--> statement-breakpoint
-- Rebuilds the trace of the Wave imports already completed (spec
-- assegnazione-wave, D14): the clients whose file_name is the name the import
-- saved, and those of the practices with that file_name. The name is
-- parseFileName (packages/domain/src/import/convert/fileName.ts) in SQL:
-- dashes become underscores and, unless the first 4 characters are a number
-- for JavaScript's Number(), MMYY_ of the month in Rome of claimed_at (or
-- started_at) goes in front. created stays NULL
WITH named AS (
	SELECT
		r."id" AS run_id,
		CASE
			WHEN left(replace(r."file_name", '-', '_'), 4) ~ '^\s*([+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?|0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+)?\s*$'
				THEN replace(r."file_name", '-', '_')
			ELSE to_char(COALESCE(r."claimed_at", r."started_at") AT TIME ZONE 'Europe/Rome', 'MMYY') || '_' || replace(r."file_name", '-', '_')
		END AS file_name
	FROM "mito-deutsche_import_run" r
	WHERE r."format" = 'wave' AND r."status" = 'completed'
)
INSERT INTO "mito-deutsche_import_run_customer" ("run_id", "customer_id", "created")
SELECT n.run_id, c."id", NULL::boolean
FROM named n
JOIN "mito-deutsche_customers" c ON c."file_name" = n.file_name
UNION
SELECT n.run_id, ctp."customer_id", NULL::boolean
FROM named n
JOIN "mito-deutsche_practices" p ON p."file_name" = n.file_name
JOIN "customers_to_pratiche" ctp ON ctp."pratica_id" = p."pratica_id"
ON CONFLICT DO NOTHING;
