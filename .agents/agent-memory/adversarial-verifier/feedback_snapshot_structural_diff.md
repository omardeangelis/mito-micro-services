---
name: snapshot-structural-diff
description: Check a generated Drizzle migration by diffing its snapshot against the previous one; the SQL can omit a change the snapshot carries, and the checks must cover the whole snapshot, not just the intended index
metadata:
  type: feedback
---

To verify a migration in the DB contract chain, do three things with node (no DB, no `db:*` script): (1) `prevId` of the new snapshot equals the `id` of the previous one; (2) `when` in `_journal.json` grows; (3) a recursive structural diff of the two snapshots, with only `id` and `prevId` excluded, lists every change. The intended change should be the only one. Any other change is a finding, even when the SQL file does not mention it.

In the PR5a run the structural diff showed a `customers.id` default changed from one random `nanoid()` value to another, with no SQL statement. The root cause is `default(nanoid())` at `src/server/db/schema/customers.ts:42`, which runs when the module loads, so each generation records a new random default. Grepping just the target index would have missed it.

**Why:** A targeted check (the two index names) passed. The full diff found the unrelated churn.

**How to apply:** Any charter that touches `src/server/db/migrations/meta/*` gets the full structural diff. Keep the probe script in the clean copy and delete it afterwards.
