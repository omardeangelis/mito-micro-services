---
name: read-move-parity-battery
description: Read-query move to a service: whitespace-normalised extract of base chains in head, typedump md5 per procedure, mutants in a gate worktree; which survivors are equivalent
metadata:
  type: feedback
---

For a "same SQL, moved into services/*/queries.ts" pass: (1) strip whitespace and `//` comments from base and head, extract each drizzle chain from base (`db.select(` to last `.limit(1)`), rename `db`/`input.x` to head names, and test `in head`; four of four matched. (2) Run the scratchpad typedump on a base and a head worktree and md5 the lines of each procedure: equal. (3) 24 mutants in a gate worktree via a python3 -I exact-pair runner (restore in `finally`, `git status` after).

Survivors and why they are not findings: removing `.limit(1)` or the GREATEST order of `getActiveTask` is equivalent because of the partial unique index `task_customer_active_uidx` (SPEC says no tie test). Removing the `[]` short-circuit is equivalent in the response (drizzle 0.45 `inArray([])` is `false`), so "without a query" is not pinned by any test. `innerJoin`->`leftJoin` on customers is equivalent through the FK. Real fixture gap: a `length <= 1` mutant of the short-circuit survives (no one-id case).

**Why:** a mutant of mine (`... || undefined`) was a no-op and showed as SURVIVED; check each survivor really changes the SQL before counting it.

**How to apply:** repeat for any move of read chains; reuse `scratchpad/v/run.py` shape.
