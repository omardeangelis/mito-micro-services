-- Active contact realignment (PR6, T6.9, D26): what
-- src/server/db/scripts/contatti-operator-mismatch.sql lists in (a). A customer
-- and its active contact have the same operator; after PR6 no code path
-- separates them, and this moves the ones that were separated before.
--
-- Every active contact whose customer has an operator takes that operator,
-- whether it had another one or none: the customer wins, as in D14 and in the
-- PR2 realignment. Each contact it moves gets a row in task_event_log
-- (operator_reassign, source bulk, from and to operator, the system operator
-- as the actor): the calls already registered on it go to the new operator in
-- the export (AC75, A16).
--
-- Left as they are: the inactive contacts (history), the contacts without a
-- customer, and the active contacts whose customer has no operator, with or
-- without an operator of their own (cases (b) and (c) of the script; only the
-- owner decides (b)). task.updated_at stays as it is (A6): the "Aggiornato"
-- order doesn't change. Running it again changes nothing.
--
-- If it fails, nothing is applied (the migrator runs every pending migration
-- in one transaction). The command prints no reason: see PLAN.md, T6.7, step 3.

-- 1. The application writes a customer's operator and its contact's together,
-- and does it under the lock of the contact. The move below reads the pairs
-- once: a handover that commits between that read and the UPDATE would be
-- undone, and the pair split again (at the UPDATE, READ COMMITTED re-reads only
-- the contact's own row, and a handover to the operator the contact already
-- has changes only the customer). So the table is locked first: writes to
-- task wait (reads don't), and the guard and the move below see every
-- committed change.
-- In the release session the index migration before this one already holds a
-- stronger lock on task until the COMMIT, and has set the same limit, so this
-- changes nothing there. Run alone, the wait for the lock is capped at 5 s:
-- the migration gives up and rolls back, and can be run again.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint

LOCK TABLE "mito-deutsche_task" IN EXCLUSIVE MODE;
--> statement-breakpoint

-- 2. Without the system operator the rows of the log would have no actor: the
-- migration stops instead, and rolls back with the others of the same run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "mito-deutsche_operator" WHERE "user_id" = 'system'
  ) AND EXISTS (
    SELECT 1
    FROM "mito-deutsche_task" t
    JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
    WHERE t."is_active"
      AND c."operator_id" IS NOT NULL
      AND t."operator_id" IS DISTINCT FROM c."operator_id"
  ) THEN
    RAISE EXCEPTION 'contatti_contact_realign: the system operator (user_id = ''system'') is missing, and there are contacts to move';
  END IF;
END $$;
--> statement-breakpoint

-- 3. One statement: "to_move" reads the old operator (an UPDATE ... RETURNING
-- would give only the new one, and the log wants both), and the UPDATE and the
-- INSERT both start from it, so they see the same rows. The log gets a row
-- for each contact the UPDATE returned.
WITH "to_move" AS (
  SELECT
    t."id" AS "task_id",
    t."customer_id",
    t."operator_id" AS "from_operator_id",
    c."operator_id" AS "to_operator_id"
  FROM "mito-deutsche_task" t
  JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
  WHERE t."is_active"
    AND c."operator_id" IS NOT NULL
    AND t."operator_id" IS DISTINCT FROM c."operator_id"
),
"moved" AS (
  UPDATE "mito-deutsche_task" AS t
  SET "operator_id" = m."to_operator_id"
  FROM "to_move" m
  WHERE t."id" = m."task_id"
  RETURNING t."id"
)
INSERT INTO "mito-deutsche_task_event_log" (
  "customer_id",
  "task_id",
  "actor_operator_id",
  "action",
  "source",
  "from_operator_id",
  "to_operator_id"
)
SELECT
  m."customer_id",
  m."task_id",
  (SELECT "id" FROM "mito-deutsche_operator" WHERE "user_id" = 'system'),
  'operator_reassign',
  'bulk',
  m."from_operator_id",
  m."to_operator_id"
FROM "to_move" m
JOIN "moved" ON "moved"."id" = m."task_id";
