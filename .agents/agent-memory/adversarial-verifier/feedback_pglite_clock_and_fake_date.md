---
name: pglite-clock-and-fake-date
description: PGlite timestamps are millisecond-resolution and follow a faked Date.now - frozen-before-seed tests make "updatedAt bumped" vacuous, and default-timestamp ORDER BY ties
metadata:
  type: feedback
---

Probe (PGlite 0.2.x, scratch script importing `<repo>/node_modules/@electric-sql/pglite/dist/index.js`):

- 200 consecutive `insert ... default values` with `ts timestamptz default CURRENT_TIMESTAMP`: all values ms-aligned, only 39 distinct. **Ties on default timestamps are the norm**, so any characterization of `ORDER BY <default-timestamp column>` (`max(lastImportUpdate)`, `updatedAt` without tiebreak) is nondeterministic unless the fixture sets the column explicitly.
- Replacing `Date.now` makes PGlite's `now()` and `clock_timestamp()` return the fake instant. With `vi.useFakeTimers({ toFake: ["Date"] })` set **before seeding**, DB defaults (`createdAt`, `updatedAt`, `lastImportUpdate`) equal the call instant, so "updatedAt moved to the call instant" passes even when nothing was written. Require: seed at T0, `vi.setSystemTime(T1)`, call, assert T1 != seed value.

**Why:** both traps make a write/order characterization pass on broken code. **How to apply:** any plan or test that freezes time on PGlite or orders by a DB-default timestamp. Also check the fixture for the plan's own mutants: a "also writes operatorId: null" mutant survives a customer seeded without an operator.

Related: [[refactor-spec-ac-checks]], [[vacuous-test-patterns]], [[day-rule-tests-and-tz-matrix]]
