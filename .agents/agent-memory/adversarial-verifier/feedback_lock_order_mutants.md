---
name: lock-order-mutants
description: A lock-taken-before-read ordering is invisible to a single-connection PGlite test; a trigger proves the lock exists, not its position. Mutant-check it explicitly.
metadata:
  type: feedback
---

A "lock first, then read" rule (for example `lockCustomer` before reading `customers.chat_id`) cannot be pinned by a test that uses a lock-check trigger. The trigger only sees that the row's `xmax` is the current transaction, so moving the read before the lock passes every test (checked: 32/32 green with the read moved above `lockCustomer` in `createCustomerChat`).

**Why:** the trigger asserts presence of the lock at write time. The read happens earlier, and in a single-connection harness nothing can interleave between read and lock. The regression only shows with two real transactions, which PGlite cannot run.

**How to apply:** when a review relies on lock ordering, run the read-before-lock mutant explicitly. If it survives, report it as a MAJOR test gap and ask for statement-order evidence (for example recording the SQL inside the transaction and asserting the `for update` precedes the read), not for a test that cannot run. Also check the delete-side re-check after the lock the same way: removing it passes too when the path is serial.

**Real-Postgres stress harness (works, ~10 s per seed).** A private `*.pg.test.ts` that fires ~18 random writers at once through `createTestCaller` (pool of 10) on 6 customers, 25 rounds per seed, then checks after every round: at most one active task, customer operator = active contact operator, and a `from = previous to` chain on the log rows per task_id. Sample `pg_stat_activity` (wait_event_type = 'Lock') during each round to prove real contention happened. Run two negative controls before trusting green: drop `FOR UPDATE` from the customer lock (splits appear at once), and add a task `FOR UPDATE` before the customer lock (dozens of "deadlock detected"). The order mutant survived all 99 PGlite tests of the area. That is a test gap to report, but not a bug at HEAD.

**False positive to filter.** Two concurrent `refreshPriorities` runs deadlock each other: each takes priority groups in its own order, and the cron sits outside the lock rule. Before you blame the change, read the cycle in `docker logs <pg> --since <t>` (look at the `DETAIL: Process … :` lines). Fire at most one refresh per round, or ignore refresh-only cycles.

Related: [[feedback_vacuous_test_patterns]], [[feedback_mutant_harness_hygiene]], [[audit-log-chain-probe]]
