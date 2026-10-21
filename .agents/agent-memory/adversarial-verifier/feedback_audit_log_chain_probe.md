---
name: audit-log-chain-probe
description: Prove an append-only reassign log has no missing or double rows across app writers plus a data migration - per-entity chain check, export oracle via the real reader
metadata:
  type: feedback
---

To prove "every operator change writes exactly one log row, and app and migration never log the same move twice":

- Seed random data at the pre-migration schema tag, run random app actions through the real tRPC caller (accepted and rejected ones), then exec the migration SQL in BEGIN/COMMIT. For each entity (task by task_id, customer by task_id NULL + customer_id), walk its reassign rows by id: each row's `from` equals the previous `to` (start = initial value), `from <> to`, and the last `to` equals the final column value. One check catches missing rows, double rows and no-op rows. Kill-check it with a "skip the contact row" mutant.
- For the export side, call the real reader (`closedCalls` via runServer) before and after, and first assert that a JS oracle reproduces the "before" result (so the oracle is not vacuous); then diff after vs oracle and classify rows as entered / changed operator / left.
- Concurrency orderings the PGlite chain can't show (migration holding its lock while the app arrives, app holding the customer lock first) go in a private `.pg.test.ts` using a gated `pgClient.begin` and `waitUntilBlocked`; the app-first-then-migration case ended in "deadlock detected" with the migration as victim and no double row.

**Why:** fixture tests assert rows per scenario; only a chain over mixed sequences shows that two writers never both log one move.
**How to apply:** any review of an audit/event log fed by several writers plus a backfill; see [[data-migration-row-differential]] and [[read-mirrors-write-differential]].
