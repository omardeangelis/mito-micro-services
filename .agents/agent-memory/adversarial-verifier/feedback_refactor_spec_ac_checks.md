---
name: refactor-spec-ac-checks
description: How to break a "move router X to Effect at unchanged behavior" SPEC - grep ACs that pass vacuously, mutation writes not pinned, zod-type rule vs domain freeze, driver-dependent results
metadata:
  type: feedback
---

Checks that found real gaps in a pure-refactor spec (customer router to L1/L2):

- **Run every grep AC against today's code and ask what it misses.** `git grep 'from "drizzle-orm"'` as proof of "no inline Drizzle" misses procedures that query with only table objects + `ctx.db` (insert, `selectDistinct(...).orderBy(table.col)`), calls into a `shared/` helper given `ctx.db`, and `drizzle-orm/pg-core` imports. A grep that is already empty today (e.g. "services don't import api/routers") proves nothing about the move. Propose `@mito/db|ctx\.db|drizzle-orm` instead.
  **Why:** the main AC's mechanical proof passed on a file that was still inline. **How to apply:** every "git grep ... is empty" criterion.
- **"Pins response and errors" isn't enough for mutations.** An UPDATE without RETURNING answers with the driver result whatever columns it wrote. The characterization AC must pin the row state (columns written, `$onUpdate` updatedAt bump, other rows untouched).
- **"Service types don't derive from zod" vs a frozen `packages/domain`.** grep the service's future input types (`CustomerSearchBy`, `AdvancedFilter`, `ContactsFilters`) for `z.infer`/`z.output`. Check precedent services too (getContacts already uses `z.output`). If the spec also forbids domain edits, the rule has no clean fix: flag it.
- **Driver-dependent claims: PGlite probe, plus point to the `*.pg.test.ts` harness.** PGlite answers `{rows, fields, affectedRows}` for an UPDATE and accepts an `undefined` param (0 rows). postgres-js throws UNDEFINED_VALUE (`connection.js` build -> `handleValue`). If a spec gives up on a test because "PGlite says nothing about prod", the pg harness (postgres-js on PG15 in CI) is the missing option.
- **`.default(nanoid())` on `customers.id` is a constant DB default.** An insert without id works once, then fails on the pkey (probe confirmed). Use it as a quirk to check any list of current customer quirks against.
- **Unattributed Decision Log rows that override a governing doc** (TD6 "remove at every step", Leonardo rule) are agent decisions, not the user's. Flag them, and check that the strategy doc's counts/rules get updated.

Plan-level checks for the same kind of refactor (customer PLAN review):

- **"Covered by existing tests" vs an AC that demands full rows.** grep the existing tests for the procedure whose code moves most: `toMatchObject` on 3 fields plus id lists left the 15-column select unpinned. The plan added characterization for every procedure except the one it relied on old tests for.
- **Validation greps without a pathspec** (`git grep -n <removedSymbol>`) also hit `brain/` plans that name the symbol, so the gate can never pass. Check every grep against `git grep -c` across the whole repo, untracked spec files included.
- **"Other tests that call procedure X" lists:** grep `\.customer\.<proc>\(` in tests. Some named files only import the service directly; that matters for which validations a task must rerun.
- **Debt entries an AC requires "with a proposed fix for each":** read the actual debt row, not the plan's list. The row only said "una PR per stranezza", and the plan's closing task only flipped its status.
- **postgres-js `RowList`:** `count`, `command`, `state` and `statement` are non-enumerable, so `toEqual([])` passes for a RowList and for a plain `[]`. Also, drizzle `set()` with every value undefined throws "No values to set" synchronously, an extra unpinned error path for optional-field updates.

Second refactor spec (pratiche + task to L1/L2), what found gaps:

- **The stricter grep over-matches too.** `@mito/db` in router files also hits zod enum tuples imported from schema files (`z.enum(taskStatus)`, `z.enum(stateEnum)`), even in files the spec calls finished adapters and "the model". Classify every hit on base as DB access or not. Before calling it unsatisfiable, look for domain stand-ins (`allStates`, `selectXSchema.shape.col` probed with tsx).
- **Permission AC scope vs precedent.** The precedent had an exhaustive per-procedure guard matrix (`procedures.db.test.ts`, keys checked against the router). A spec that scopes "no operator -> BAD_REQUEST, disabled -> UNAUTHORIZED" to "the tests of AC8" leaves the moved procedures with no guard pin. grep `disabledAt: new Date()` and the actor (not the target) in tests.
- **A list of "operatorId written without findWorkingOperator" writers:** check every `createInsertSchema` input. It takes all columns, so an `insertX` on `protectedProcedure` writes `operatorId` as well.
- **Removed procedures still mocked in UI tests** (`api.<router>.<proc>` nested object, missed by a dotted grep) leave a `not.toHaveBeenCalled` that can no longer fail.

Related: [[plan-verification-techniques]], [[vacuous-test-patterns]], [[pglite-clock-and-fake-date]]
