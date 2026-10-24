---
name: injection-test-payload-and-param-binding
description: SQLi regression tests whose payload is a TRUE predicate pass on vulnerable code; date-param parity needs a non-UTC session; check library versions in the worktree lockfile
metadata:
  type: feedback
---

- **An injection test "payload leaves total unchanged" is vacuous when the payload evaluates TRUE.** `EXISTS (SELECT 1 FROM "mito-deutsche_user")` through `createTestCaller` is always true (`createOperator` inserts the caller's own user row), so `AND EXISTS(...)` leaves the result unchanged on the vulnerable `sql.raw` code (probe: 2 → 2). Discriminating payloads: `NOT EXISTS (...)` (2 → 0), or `EXISTS (... WHERE role = 'ADMIN')` with an OPERATORE caller and no admin. `1=1) OR (1=1` without a narrowing filter is red only by syntax error; pair it with a `q` that matches a strict subset (1 → 2 on vulnerable code).
  **Why:** a plan claimed "today it goes 0 → 1"; a 30-line probe in a scratch copy showed it stays the same. **How to apply:** for every injection test, run its payload once on the baseline and record before/after counts; require both `data` and `total` assertions (separate queries can be mutated separately).
- **Date filters bound as params: UTC sessions can't tell a string param from a `Date`/`toISOString` param.** Both harnesses here pin UTC (`src/test/db.ts` `SET TIME ZONE 'UTC'`, `src/test/pg.ts` `TimeZone: "UTC"`) while the real DBs run Europe/Rome. PGlite 0.2.17 passes a string param for timestamptz through to Postgres (session zone applies), so a PGlite test with `SET TIME ZONE 'Europe/Rome'` and a row at 23:30Z the day before separates them (literal and string: included; encoder path: excluded). A fixture at exactly 00:00Z matches both ways in both zones.
- **Library-source claims: read the worktree's lockfile, not the main checkout's node_modules.** The main checkout can sit on an older commit (drizzle 0.33 vs 0.45.4 at the baseline). Use `git show <sha>:pnpm-lock.yaml` and the worktree's own node_modules.
- **Removing a field from a tRPC zod input breaks `tsc` at every object-literal caller (TS2353).** In a plan, a task that drops an input field before the task that edits its page callers leaves tsc red in between; probe with a scratch copy whose `node_modules/@mito/*` links point at the copy's packages.

Related: [[vacuous-test-patterns]], [[plan-verification-techniques]], [[mutant-battery-scratch-copy]]
