---
name: spec-bundled-clause-and-enum-terms
description: Spec gate checks - per-procedure clauses, enum-colliding prose, unscoped grep ACs, vitest TZ claims
metadata:
  type: feedback
---

When a characterization AC says "per A, B e C: <clausola>", check the clause against each procedure's code one at a time. A role or owner filter is often true for two of them and false for the third (analytics spec: OPERATORE-only clause asserted for a `protectedProcedure` with no role filter, which another AC described the opposite way). An AC that must be green on today's code and asserts a false behavior is unsatisfiable: a blocker, with a one-line fix.

Also grep the schema enums for the spec's prose words: "pratiche liquidate" collides with state `Liquidata`, while the query filters only on a NOT NULL date column, so a hostile reader can implement a different measure.

**Why:** both slipped past the author's self-review because the bundled clause reads naturally and the prose term matches the UI label.

**How to apply:** in every spec gate, build a procedure x clause table from the code, and check every quantity's defining words against `pgEnum` values. Related: [[refactor-spec-ac-checks]], [[guard-matrix-parity-mutants]].

**Unscoped grep checks in ACs:** an AC that says "`git grep -n <name>` non trova niente" without a pathspec can never pass once the spec (and the brain docs that track the debt) name it. Run the AC's command as written; ask for `-- packages src apps` and, if the tests name the old key, `':!**/_test/**'` (pratiche-effect AC7 is the house precedent).

**TZ claims in specs:** in pass 1 I accepted "vitest gira in UTC" from `env: { TZ: "UTC" }`; it is false for the unit project (vitest 1.6 threads pool, `vitest.workspace.ts` says so, and a `worker_threads` probe that sets `process.env.TZ` inside the worker keeps the machine zone). Recall [[day-rule-tests-and-tz-matrix]] before passing any TZ statement. A "same day on server and browser" AC needs the `timeZoneTests` utc/rome projects, which live in `vitest.config.ts`: check that the perimeter allows it.
