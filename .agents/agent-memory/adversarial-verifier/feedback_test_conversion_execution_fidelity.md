---
name: test-conversion-execution-fidelity
description: How to prove converted tests (it -> it.effect etc.) still execute their assertions: per-test assertionCalls differential, floating-Effect type scan, base-vs-head mutant differential
metadata:
  type: feedback
---

To check that a test-framework conversion (vitest `it` -> `@effect/vitest` `it.effect`) kept every assertion executing:

1. **Per-test assertionCalls differential.** Add a setup file in throwaway base and head worktrees: `afterEach((ctx) => appendFileSync(OUT, {file, name, calls: expect.getState().assertionCalls}))`, add it to every project's `setupFiles`, run the changed files in both, and diff by (project, file, name). Same counts = assertions really ran. A diff of 1 inside `vi.waitFor` is only retry timing (first try passed). Tests with 0 calls must pass because the program they `yield*` succeeds: check them by hand.
2. **Type scan with the TS compiler API** (on the test files): look for ExpressionStatements typed `Effect<...>` (built but never yielded), `expect(<Effect>)`, and discarded or unused `Exit` values. In Effect 4, `Exit` and TaggedErrors are Effect subtypes (they have `~effect/Effect`), so filter by type name or you get dozens of false positives.
3. **Base-vs-head mutant differential.** Production code is identical in both trees. Apply the same mutant to both, run the same files with the JSON reporter, and compare the sets of failing tests. A test that dies on base but survives on head means the conversion lost sensitivity. Clock mutants are the useful ones: TestClock is frozen, while base used the real clock or a fixed `Clock` whose `sleep` returns at once.
   - A frozen clock can make a test *stronger*: `elapsed >= budget` -> `>` with budget 0 dies only on head.
   - Run pnpm from python via `arch -arm64`, or rollup's native module fails (x64 node).

**Why:** matching assertion chains (the AC5 script) do not prove the chains run. Counts plus a mutant differential do, and both are cheap (about 1 min per run of 53 files).
