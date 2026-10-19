-- Drops the two partial indexes PR2 added for the list of contacts (PR5a,
-- T5.16; the decision and the numbers are in PLAN.md, T5.16). Measured in
-- production with the real query of task.getContacts: the first page of the
-- default list takes about 62 ms with task_priority_active_idx and 78 ms
-- without it (page 2000: 216 and 332 ms; "without" is the same query with the
-- partial indexes switched off, so it is an estimate to check again after the
-- drop), and task_operator_active_idx saves less than 10 ms. Both make the
-- UPDATEs of priority and operator_id non-HOT.
--
-- DROP INDEX takes an ACCESS EXCLUSIVE lock on "mito-deutsche_task", reads
-- included, and the migrator runs every pending migration in one transaction.
-- While the DROP waits for the lock, every query on the table waits behind it.
-- lock_timeout caps that wait at 5 s: the migration gives up and rolls back
-- (nothing is dropped) instead of waiting behind a long transaction. If it
-- fails with "canceling statement due to lock timeout", run it again later.
--
-- Rollback (by hand, in one transaction so the cap on the wait applies to both
-- statements; then put the index back in src/server/db/schema/task.ts and
-- generate a migration with CREATE INDEX IF NOT EXISTS, so the schema, the
-- snapshot and the database agree again):
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   CREATE INDEX task_priority_active_idx ON "mito-deutsche_task" USING btree (priority DESC NULLS LAST) WHERE is_active;
--   CREATE INDEX task_operator_active_idx ON "mito-deutsche_task" USING btree (operator_id) WHERE is_active;
--   COMMIT;
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DROP INDEX IF EXISTS "task_operator_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "task_priority_active_idx";