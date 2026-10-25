---
name: query-builder-param-and-plan-prototype
description: Plan checks - a "bad param makes the DB fail" claim may be false because the query builder drops it; prototype a plan's service in scratch and run its planned cases and mutants; owner-less fixtures
metadata:
  type: feedback
---

Found reviewing the chat/storage step-5 PLAN (2026-10-25):

- **Check the query builder before accepting "invalid value X makes Postgres fail".** Drizzle 0.45 `pg-core/dialect.js` renders `limit` only when `limit >= 0`: `limit: -1` (or -0.5) sends no LIMIT and returns every row, on PGlite and postgres-js alike. Only a fractional limit errors (`invalid input syntax for type bigint: "2.5"`). SPEC, plan, characterization test and debt row all said "negative limit -> INTERNAL_SERVER_ERROR": the planned test would have been red on base. **How to apply:** for every quirk a characterization test pins, run it once on base (out-of-tree probe, both drivers) before passing the plan.
- **Prototype the plan's new service in the scratchpad** (import `@mito/server/effect/db` etc., switch mutants with an env var) and run the plan's own cases on PGlite and Postgres. Fast, and it settles algorithm claims (lock order, READ COMMITTED re-reads, `onConflictDoNothing` under concurrency, `beforeNextLockOf` "no FOR UPDATE ran") plus which named test kills each mutant (often the error tag, not the row state: an FK already blocks the write).
- **"Of a colleague" fixtures:** check the factory sets the owner column. `createCustomer` leaves `operator_id` NULL, so "C is not the customer's operator" is vacuous and won't flip when the visibility rule lands.
- **Probe output:** tests that `vi.spyOn(console, "log")` swallow probe prints; write with `process.stdout.write`.

Related: [[out-of-tree-vitest-probe]], [[plan-mutant-equivalence-and-removal-grep]], [[refactor-spec-ac-checks]]
