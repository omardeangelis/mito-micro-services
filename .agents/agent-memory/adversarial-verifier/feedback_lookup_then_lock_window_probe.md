---
name: lookup-then-lock-window-probe
description: Probe an unlocked "find the owner, then lock it" writer by rewriting the pointer while it waits; read pg kill reasons (deadlock vs tag); grep stale full-row write-backs of the pointer column
metadata:
  type: feedback
---

For a writer that looks up the owning row without a lock and then locks it (send of a note: `customers WHERE chat_id = X`, then `lockCustomer`), `holdCustomerLock(owner)` parks the writer exactly in the window: lookup done, waiting on the lock. From the held transaction, rewrite the pointer (clear it, move it to a second customer, point two customers at it), release, then hold the *new* owner's lock from another connection. If the writer still finishes, its writes don't depend on the lock of the row that points to the target at write time. That showed the guarantee rests on "no other writer of the pointer column exists".

**Why:** a single-connection PGlite trigger can't show this window, and the repo's own pg tests only cover the deletion path. The other writers of the pointer were an import route that writes back a whole DB row read earlier (`{...dbRow, ...cleaned}` minus a few keys), so the pointer column goes back in stale and unlocked; a plain grep for `chatId:` in `.set({…})` misses it because the key arrives through the spread.

**How to apply:** (1) grep `update(<table>)` writers and check which spread a full row or request body into `set`; (2) for each order mutant, read the pg kill reason: a moved `UPDATE` on an uncovered table died with `DbError` (a deadlock 40P01) where the test expected the tag, so the kill was real but not on the assertion's own terms; (3) a 40-round LCG-seeded stress of the real services (send, delete, create) with `pg_stat_activity` sampling took about 3 s and reproduced the deadlock for that mutant. Remove-the-lock passed the same stress, so a green stress run alone is not evidence. Related: [[lock-order-mutants]], [[pg-lock-mutant-runs]], [[cte-snapshot-probes]].
