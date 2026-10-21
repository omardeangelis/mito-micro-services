---
name: deferred-trigger-and-sync-helper-mutants
description: How to judge a test-only deferred constraint trigger and the pg-test sync helper - event/NULL-direction/UPDATE OF mutants, redundancy with end-state asserts, neutralised waitUntilBlocked, PGlite is PG16 vs prod 15
metadata:
  type: feedback
---

A test-only `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` rule (same-operator rule in `src/test/operatorRule.ts`) ran 13 mutants in about 5 minutes (python runner, exact old/new pair, `count == 1`, one vitest file, ~3 s each). What paid off:

1. **Event and direction mutants survive when the negative controls are UPDATE-only:** `AFTER INSERT OR UPDATE` -> `AFTER UPDATE` (25/25 green), `UPDATE OF operator_id`, and "skip when the customer side is NULL" all survived. The test title said "(e il contrario)" but the body tested one direction. Probe the real trigger separately (INSERT of a divergent active row, reactivation by `is_active` only, customer -> NULL) to show it is a test gap and not a bug.
2. **Remove the triggers entirely and count the survivors.** 22 of 25 tests stayed green: the writer-coverage tests were protected by their own end-state assert (`expectAligned`), not by the trigger. So the trigger only matters for a future writer that adds a call without that assert; its unpinned legs are exactly what that promise rests on.
3. **Event-row vs end-state mutant** (read NEW instead of re-querying at COMMIT) was killed only by one writer test, not by a dedicated test: check that a stale-event case exists somewhere before crediting "reads the end state".
4. **Immediate vs deferred** is killed by a "two compensating writes in one transaction" test; keep that as the pin.
5. **Sync helper in real-PG tests:** neutralising `waitUntilBlocked` (return at once) survived all pg tests, because nothing asserts that it fails when nothing is blocked. Removing the `LOCK TABLE` statement was still killed, because the migration's UPDATE then waits on the colleague's row lock and satisfies the helper: a mutant of the SQL can die for a reason other than the one the test names. Ask for a negative control (`waitUntilBlocked(1, 100)` rejects when idle).
6. **PGlite 0.2.17 is PostgreSQL 16.4 (32-bit wasm);** prod is 15.6 and the CI/local service is 15: every `*.db.test.ts` result is on a newer major. `SET LOCAL lock_timeout` and `LOCK TABLE` never wait there; `xmax = pg_current_xact_id()` lock checks are single-connection only.
7. A test-only helper that installs SQL on `testClient = new PGlite()` cannot reach a real database even if app code imported it; the missing ESLint restriction on `@/test/*` is then a NIT, but grep non-test importers (relative paths too) and the built bundle.

**Why:** the suite looked complete (25 green, every writer called), and the weakness was in which legs of the trigger the controls reach.

**How to apply:** any DB-level test rule (lock rule, same-operator rule) and any helper that synchronises two sessions. Related: [[feedback_lock_order_mutants]], [[feedback_migration_test_evidence_battery]], [[feedback_mutant_battery_scratch_copy]], [[feedback_vacuous_test_patterns]]
