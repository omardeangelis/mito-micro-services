---
name: plan-mutant-equivalence-and-removal-grep
description: Plan checks for refactor plans - probe each listed mutant for equivalence before accepting "each one killed", and run removal greps against the tests the plan itself adds
metadata:
  type: feedback
---

Found reviewing the pratiche/task refactor PLAN (2026-10-25):

- **A removal grep with no `_test` exclusion vs a test that names the removed keys.** If the plan adds a router-key test (`it.each(["getTaskById", ...])`) or a `REMOVED` list in a guard matrix, `git grep -nw <names> -- packages src apps` can never come back empty. Check every "grep finds nothing" validation against the files the plan's own tasks create, not only against base.
- **Probe listed mutants for equivalence (tsx + `.toSQL()`, NODE_PATH=<repo>/node_modules).** These were equivalent at the response level:
  - Drizzle 0.45 renders `inArray(col, [])` as `where false`, so an early `if (ids.length === 0) return []` guard is redundant;
  - `cast(<decimal> as numeric)` (`castAsNumber`) only changes the TS type: the value is still a string on both drivers. Removing it is caught only by tsc or a type diff;
  - a partial unique index (one active row per key) makes `limit 1` and ORDER BY tie mutants unkillable on the current schema.
  A plan that says "each mutant killed by a test of the file" with one of these stalls the executor.
- **`.set(input)` with a picked optional `id`:** `{}` throws "No values to set", but `{ id }` alone runs `SET id = id, updatedAt = now` and changes the row. "Without email/phone → No values to set" holds only without the id.
- **Read the existing tests before you accept "they only compare ids".** A full-row `toEqual` already existed, with a comment that contradicted the plan's "numeric" claim.

**Why:** each of these made a plan validation unsatisfiable or let a wrong expectation reach a worker.
**How to apply:** for every mutant list and every grep validation in a PLAN, spend one probe each before passing it.

Related: [[refactor-spec-ac-checks]], [[plan-verification-techniques]], [[partial-input-update-mutant]]
