---
name: cte-snapshot-probes
description: How to probe "one statement with data-modifying CTEs keeps log == moves" claims on real Postgres (EPQ window vs pre-snapshot window)
metadata:
  type: feedback
---

A claim like "the log has a row for exactly what moved, rows committed after the locks included" has three windows; existing tests usually cover only the first.
1. Row committed before the move statement starts: seen, moved, logged (typical test).
2. Row in the snapshot, held by a second tx during the statement: UPDATE waits, EPQ re-checks WHERE and re-runs correlated SET subqueries with the new row (probe: tx A holds the contact the lock step waits on; autocommit makes the late row X's; tx B locks it FOR UPDATE; release A; waitUntilBlocked(1) shows the `with ...` statement; B changes operator / state / customer_id; commit). Seen consistent on PG 15.
3. Row made X's by a tx that commits after the snapshot: not moved, not logged, left on X. Consistent with the log but contradicts "moves alike" wording.

**Why:** a code comment claimed window 3 behaves like window 1; only a probe separated them.
**How to apply:** for any single-statement move+log, run windows 2 and 3 as throwaway *.pg.test.ts (delete after), and grade a wording overclaim separately from a consistency bug. Related: [[lock-order-mutants]], [[plan-verification-techniques]].
