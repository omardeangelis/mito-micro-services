---
name: vacuous-test-patterns
description: Test/gate patterns seen in plans that cannot fail, to flag on sight
metadata:
  type: feedback
---

- **"X does not call service S" when X has no call to S on any branch** (e.g., asserting an edge runner leaves the error-reporter buffer empty when it never uses the reporter). Proves nothing; require a mutation check or drop it.
- **Test-only DB triggers installed in one file** prove the rule only for the writers that file calls; claims like "CI goes red if any writer forgets the lock" are false for writers added later unless the trigger is on by default in the harness.
- **Env-gated suites that skip when the variable is missing** pass vacuously in CI if the variable disappears; in CI they should fail, not skip.

Related: [[plan-verification-techniques]]

- **Concurrency tests on the in-memory DB (PGlite, one connection) are vacuous for row locks.** Two `Promise.all` calls on one customer pass with the `FOR UPDATE` lock removed, because the driver serializes the transactions. Only a real Postgres with two sessions can show the lock; say so instead of accepting a parallel-call test as proof.
- **Mock router + `startTransition` tests never exercise the wait.** With `router.refresh` as `vi.fn()`, a button that resets its busy state right after the server answers passes every assertion. Check that a test holds the busy state after success until the page commit, by mutation (rewire the success path to end the wait early and rerun).
- **Module-level singletons shared across tests** (e.g., a `let focusOnStart` flag not reset in `beforeEach`) make negative tests order-dependent; they pass now only because later tests overwrite the flag.
- **"Leaves the other keys as they were" tests seeded only with known keys prove nothing about unknown keys.** An explicit-object rebuild of a JSON blob (dropping every key not listed) survived 6/6 tests in the contact preference suite. Check the fixture seeds each key class the claim names (known, unknown/legacy, absent), and run an explicit-rebuild mutant before accepting the claim.
- **Mutant harness on macOS:** BSD `sed -i` needs a suffix argument (`sed -i ''`); a failed in-place edit silently mutates nothing if the exit is ignored. Use `perl -pi -e` and `cmp` the copy against the repo file before trusting a "mutant killed" result.
- **"Removes X" asserted as `toEqual([])` with X as the only entry** cannot tell remove-by-id from clear-all (a `operatorsToEdit: []` mutant survived). Seed a second entry and assert it stays.
- **Error-path `it.each` that checks the message but not that the success callback stayed uncalled**: moving `onDeactivated` above the `res.error` check survived; only the reject test had `not.toHaveBeenCalled`. Likewise a busy flag reset in `finally` was pinned only on reject, not on the `{error}` result: move the reset into `catch` and rerun.
