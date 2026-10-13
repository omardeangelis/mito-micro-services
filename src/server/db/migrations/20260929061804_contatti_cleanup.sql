-- Contatti cleanup (PR2, T2.2): what src/server/db/scripts/contatti-cleanup-preview.sql
-- lists in (a) and (b). No row is deleted, no row goes to task_event_log, and
-- task.updated_at and task.alert_id stay as they are.

-- 1. Each customer keeps one active contact, the one the UI shows today: the
-- most recent by GREATEST(updated_at, created_at), then by the higher id. The
-- others become inactive. Contacts without a customer are not touched.
UPDATE "mito-deutsche_task" AS t
SET "is_active" = false
FROM (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "customer_id"
      ORDER BY GREATEST("updated_at", "created_at") DESC, "id" DESC
    ) AS "rank"
  FROM "mito-deutsche_task"
  WHERE "is_active" AND "customer_id" IS NOT NULL
) AS ranked
WHERE t."id" = ranked."id" AND ranked."rank" > 1;
--> statement-breakpoint

-- 2. The open alerts on inactive contacts, and on contacts without a customer
-- (the alert cron fails on these at every run), are closed as resolved by the
-- system operator. updated_at is the closing date the history shows.
-- Without the system operator they would be closed by nobody: the migration
-- stops instead, and rolls back with the others of the same run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "mito-deutsche_operator" WHERE "user_id" = 'system'
  ) AND EXISTS (
    SELECT 1
    FROM "mito-deutsche_alert" a
    JOIN "mito-deutsche_task" t ON t."id" = a."task_id"
    WHERE NOT a."is_resolved" AND (NOT t."is_active" OR t."customer_id" IS NULL)
  ) THEN
    RAISE EXCEPTION 'contatti_cleanup: the system operator (user_id = ''system'') is missing, and there are alerts to close';
  END IF;
END $$;
--> statement-breakpoint

UPDATE "mito-deutsche_alert" AS a
SET
  "is_resolved" = true,
  "resolved_by" = (
    SELECT "id" FROM "mito-deutsche_operator" WHERE "user_id" = 'system'
  ),
  "updated_at" = now()
FROM "mito-deutsche_task" AS t
WHERE t."id" = a."task_id"
  AND NOT a."is_resolved"
  AND (NOT t."is_active" OR t."customer_id" IS NULL);
