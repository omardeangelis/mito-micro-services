-- Operator realignment (PR2, T2.5): what src/server/db/scripts/contatti-cleanup-preview.sql
-- counts in (c). On 28/09/2026 an "Assegna Clienti" without a WHERE moved
-- almost every task in production to one operator (fixed in PR1).
--
-- Every task, active or not, takes the operator of its customer. Tasks
-- without a customer, or whose customer has no operator, keep theirs: no task
-- loses its operator, so none drops out of the calls export. No row goes to
-- task_event_log, and task.updated_at stays as it is.
UPDATE "mito-deutsche_task" AS t
SET "operator_id" = c."operator_id"
FROM "mito-deutsche_customers" AS c
WHERE c."id" = t."customer_id"
  AND c."operator_id" IS NOT NULL
  AND t."operator_id" IS DISTINCT FROM c."operator_id";
