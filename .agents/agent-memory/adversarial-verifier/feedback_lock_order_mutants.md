---
name: lock-order-mutants
description: A lock-taken-before-read ordering is invisible to a single-connection PGlite test; a trigger proves the lock exists, not its position. Mutant-check it explicitly.
metadata:
  type: feedback
---

A "lock first, then read" rule (for example `lockCustomer` before reading `customers.chat_id`) cannot be pinned by a test that uses a lock-check trigger. The trigger only sees that the row's `xmax` is the current transaction, so moving the read before the lock passes every test (checked: 32/32 green with the read moved above `lockCustomer` in `createCustomerChat`).

**Why:** the trigger asserts presence of the lock at write time. The read happens earlier, and in a single-connection harness nothing can interleave between read and lock. The regression only shows with two real transactions, which PGlite cannot run.

**How to apply:** when a review relies on lock ordering, run the read-before-lock mutant explicitly. If it survives, report it as a MAJOR test gap and ask for statement-order evidence (for example recording the SQL inside the transaction and asserting the `for update` precedes the read), not for a test that cannot run. Also check the delete-side re-check after the lock the same way: removing it passes too when the path is serial.

Related: [[feedback_vacuous_test_patterns]], [[feedback_mutant_harness_hygiene]]
