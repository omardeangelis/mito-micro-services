---
name: fake-tx-mutant-and-pg-wait-limits
description: "Remove transaction" dies on Service-not-found Tx (uninformative); use a fake-Tx (Db client) mutant; real-PG lock-wait tests can't tell an autocommit lock from a held one; first-write failpoint is trivial
metadata:
  type: feedback
---

Three lessons from the gate pass on the chat-storage-effect send service (2026-10-25), a service built as `transaction(Effect.gen(lockCustomer ... writes))`:

1. **"transaction removed" is an uninformative kill.** `lockCustomer` does `yield* Tx`, so a pass-through wrapper dies with `Service not found: Tx` in 16 tests, whatever the failpoint tests do. To judge the failpoint tests, use a fake-Tx mutant: a wrapper that reads `Db` and runs the program with `Effect.provideService(Tx, { client: db, failed: false })` (autocommit statements, lock released at once). It was killed by the PGlite failpoint tests (`failNextInsertInto(messages)`, `failNextUpdateOf(chat)`) and the lockRule xmax trigger, which is the signal wanted.
2. **Real-PG lock-wait tests (`holdCustomerLock` + `waitUntilBlocked`) prove the lock statement waits, not that the lock is held until commit.** The fake-Tx mutant survived all 3 pg tests (the autocommit `SELECT ... FOR UPDATE` still blocks behind the held lock), and only PGlite tests killed it. Say which suite carries the "held to commit" property instead of crediting the pg file with it.
3. **A failpoint on the first write of the sequence passes without a transaction.** `failNextInsertInto(chatToOperator)` where the join insert is the first write: "the note is not saved" holds trivially. The other two failpoints (messages insert, chat update) carry the atomicity. Check each failpoint test against the fake-Tx mutant before counting it.

Also: the `lockCustomer`-removed mutant is killed by `beforeNextLockOf` itself (its `onTestFinished` throws if no `FOR UPDATE` ran), so check the kill reason when counting that test as proof of the lock.

**How to apply:** for a service with lock + transaction, run: no lock, fake Tx, lock-after-chat-read, lock-only-for-new-member, onConflict removed; read each kill list by test name.

Related: [[feedback_tx_rollback_mutant_masking]], [[feedback_lock_order_mutants]], [[feedback_pg_lock_mutant_runs]]
