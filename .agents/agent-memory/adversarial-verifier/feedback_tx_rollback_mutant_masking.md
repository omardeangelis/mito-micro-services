---
name: tx-rollback-mutant-masking
description: A DB-level failpoint (failing UPDATE) kills a no-real-transaction mutant but not a commit-after-a-JS-failure mutant; Postgres aborts the transaction on a SQL error, so COMMIT rolls back anyway. Test rollback with both.
metadata:
  type: feedback
---

When a test makes a statement fail inside the database (a failpoint trigger that raises), Postgres aborts the whole transaction. The COMMIT that follows rolls back silently, even if the application code commits on failure. So that test kills the "no real transaction" mutant (writes go through autocommit) but NOT the mutant "transaction commits when the program failed" (checked: removing the `throw new Rollback()` in `transaction` left the delete-service test green; only the db.db rollback tests with a typed error after the writes failed).

**Why:** the DB-level failpoint hides the application's own rollback path. The Effect `transaction` helper relies on `Tx.failed` for exactly this reason; the typed-error rollback tests are what pin the JS side.

**How to apply:** for a transaction guarantee, run two mutants: (1) transaction without a real transaction (kill with a DB failpoint, check that the failing test asserts a committed write), (2) commit on program failure (kill only with a typed error or defect after the writes). A service with no typed error after its writes does not need (2) pinned in its own tests; say so rather than report a gap.

Related: [[feedback_lock_order_mutants]], [[feedback_mutant_battery_scratch_copy]]
