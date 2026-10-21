---
name: table-lock-migration-probes
description: How to check a LOCK TABLE added to a data migration - lock-mode mutants, FK row-lock modes, deadlock victims, standalone vs batch timeouts, isolation
metadata:
  type: feedback
---

When a data migration takes `LOCK TABLE x IN <mode>` to serialize itself against app writers:

- **Lock-mode mutants need a ROW SHARE-only colleague.** SHARE and SHARE ROW EXCLUSIVE still block a colleague that already wrote (ROW EXCLUSIVE) but not one that only did `SELECT ... FOR UPDATE` and then changed another table. Only a test with that colleague shape kills them. A lock on a *different* table (e.g. customers, when every writer locks the customer first) can be behaviorally equivalent: only a text assertion kills it. Say so instead of calling it a gap.
- **Probe what the migration waits on** inside the test (pg_stat_activity join pg_locks where not granted) in a private copy: proves the wait is on the table lock at statement 1, not a row lock later.
- **FK checks take FOR KEY SHARE.** A plain UPDATE of a non-key column (FOR NO KEY UPDATE) does NOT block it, so a customer-only writer never makes the migration wait; only `SELECT ... FOR UPDATE` (lockCustomer) does, and that is what creates the deadlock with "customer first, then task" writers. I wrongly assumed the FK would wait on a plain update (probe hung on waitBlocked).
- **Deadlock victim varies run to run** (whichever backend's deadlock_timeout check sees the full cycle). Repeat the probe 3 times; never assert a victim.
- **Standalone vs batch:** a `SET LOCAL lock_timeout` from an earlier migration in the same migrator transaction caps the LOCK and the FK waits only in the batch. Run the migration alone too: with no cap it holds the table lock while waiting on a customer row, and every writer of the table stalls (measure with an unrelated writer).
- **Isolation:** under a REPEATABLE READ default the batch snapshot predates the lock, but the log INSERT's RI crosscheck raised 40001 (safe). Probe with `BEGIN ISOLATION LEVEL repeatable read` before calling it a finding.

- **Plain-read writers are not a hole by default.** A writer that locks the parent FOR UPDATE and reads the child *without* a lock gets a stale read under EXCLUSIVE, but if it must then write the child, the migration's FK FOR KEY SHARE on that parent closes a cycle: deadlock, never a stale commit. Probe it (both victims) before reporting a stale write.
- **Victim by queue time, measured 3/3:** writer queued after the lock grant = writer dies; queued during the DDL/LOCK wait (>~0.7 s before grant) = whole batch dies. `SET LOCAL lock_timeout` also caps FK row waits on parents (customer or operator FOR UPDATE held 7 s = 55P03, all migrations rolled back).
- **Harness:** manual runner with a beforeStmt hook to start the writer at statement k, plus the real node-postgres migrator for the rollback state (cron table, indexes, `__drizzle_migrations` count); one template clone per scenario.

Related: [[migration-batch-concurrency-probes]], [[real-migrate-cli-probe]], [[mutant-battery-scratch-copy]].
