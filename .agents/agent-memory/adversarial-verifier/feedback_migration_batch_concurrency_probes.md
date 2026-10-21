---
name: feedback-migration-batch-concurrency-probes
description: How to check a data migration's concurrency claims - EPQ recheck holes, batch AEL that is incidental, FK-check lock inversion, pause technique for real service transactions
metadata:
  type: feedback
---

How to check a hand-written data migration that claims it is safe "while users work".

- **EPQ recheck holes (READ COMMITTED, `UPDATE t ... FROM cte WHERE t.col IS NOT DISTINCT FROM m.old`).** The recheck re-reads only the target row. A concurrent tx that only *locks* the target row (`FOR UPDATE`, no update) and changes a joined/parent row passes the recheck unchanged, so the stale write lands (e.g. a handover to the contact's own operator moves only the customer, then the migration moves the contact back). Predicates that live only in the CTE (`is_active`) are not re-checked either: a concurrently deactivated row gets written. Probe both; a test that only changes the target column proves neither.
- **Batch context.** An earlier migration in the same transaction can hold ACCESS EXCLUSIVE on the table (DROP INDEX), which makes those interleavings unreachable. Check whether that protection is incidental: `DROP INDEX IF EXISTS` on a missing index takes *no* lock (probe with pg_locks), so the holes return if the index is already gone.
- **FK checks invert lock order.** An INSERT's FK check takes FOR KEY SHARE on parent rows. With AEL on the child already held, a writer that locks the parent FOR UPDATE then queues on the child closes a cycle: deadlock. The victim is whichever waiter's deadlock_timeout (1 s) fires after the cycle forms: the app writer if it queued < 1 s before, the whole batch if it queued during the DROP's wait.
- **Pause technique.** A third session holding `LOCK TABLE parent IN SHARE MODE` pauses a real service transaction exactly at its parent UPDATE while it holds child row locks; release it to commit. Run the real `drizzle-orm/node-postgres` migrator (drizzle-kit uses pg, Pool max 1) on a DB migrated to the tag before the pending batch; undo the batch (drop new table/type, recreate indexes, delete `__drizzle_migrations` rows) between scenarios.

**Why:** the T6.9 realign pg test passed on a statement-alone run; the real batch and the lock-only handover told a different story.
**How to apply:** any migration with a CTE + UPDATE + log INSERT, or any claim that a recheck makes it concurrency-safe. Related: [[feedback-lock-order-mutants]], [[feedback-real-migrate-cli-probe]].
