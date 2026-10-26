---
name: twin-window-queries-and-literal-type-claims
description: Plan gate checks - twin reference/comparison queries need every clause pinned in both windows; `?? 0` literal type claims must be probed
metadata:
  type: feedback
---

When the code under a plan runs two near-identical queries (reference and comparison window, done and todo), check that the characterization and fix tests seed each clause (role filter, join/double count, state filter, excluded rows) in BOTH windows and assert both outputs. A mutant on a shared variable (`accessCondition = undefined`) hits both queries and dies in the reference one, so it says nothing about the comparison one. A refactor or rewrite that splits or rewrites the copies can then drift on one side while the tests stay green. Ask for per-query mutants (the clause dropped only in the comparison copy).

Plans often state literal output types (`string | 0` from `x ?? 0`). In a returned object literal TS widens the fresh `0`, so the type is `string | number`. A `toEqualTypeOf` tdd_target written from the plan is red on the baseline. Probe with the TS API on a virtual file (no repo write): createProgram with the repo tsconfig, a host that serves `src/__probe__.ts`, and print `inferRouterOutputs<AppRouter>[...]`. The same probe shows whether a call with no input is legal (`Expected 1 arguments` for a `z.object` input with only optional keys).

Also check every "red first" claim against the current code by hand: a guard case such as 0/0 is often already green.

**Why:** in the analytics plan, all three slipped past the author's self-review: the comparison window was pinned for window placement only, `string | 0` was the T5 target, and "senza input" calls fail.

**How to apply:** on any plan with characterization tests, build a query x clause x window table. Run the type probe before passing a type claim. Related: [[router-type-contract-differential]], [[equal-counts-swap-mutants]], [[vacuous-test-patterns]].
