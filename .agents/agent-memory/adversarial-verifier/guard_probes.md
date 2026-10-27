---
name: guard-probes-how-to-check
description: How to probe an assertion-diff guard (AST chain comparison) for false negatives; which probes to run before trusting a "ok" result
metadata:
  type: feedback
---

When a guard reports "ok" on a test-assertion diff, do not trust it until these probes have been run in a scratch git repo (never in the repo under review):

- Whitespace or comma-paren edits inside string literals (`toBe("a b")` -> `toBe("ab")`). Whitespace-stripping normalizers hide these.
- Adding `it.skip` / `describe.skip` with the assertions left in place.
- Moving an assertion from one test into another test. Multiset comparison over a whole file hides relocation.
- Assertion roots the guard does not recognize (for example `expectTypeOf`, `assert(...)` call form).
- A positive control (changed matcher value, deleted test with assertions) must FAIL, and a reflow-only change must pass.
- Second round (after the guard got token keys and marker counts), all of these still passed silently: a pure `git mv` of `x.test.ts` to `x.tst.ts` or `_test/x.ts` (a `before === after` skip means 0 chains compared, but the file no longer runs); `it(name, { skip: true }, fn)`; `ctx.skip()` or `return` in the body; `describe.skipIf(!hasDb)` -> `skipIf(true)` (the marker key drops the argument); `it.each` table rows changed, or `it(...)` -> `it.each([])(...)` (zero runs); bare `assert(cond)`; `ctx.expect(...)`; dropping `await` before `expect().rejects`; an `expected` const changed outside the chain; exceptions keyed by `file:line` excuse any chain on that line.
- Third round (per-file multiset, marker args/options/titles, rename projects, exceptions by chain hash): still ok on `it.each(table)` with the const table changed (47 such sites in the repo), tagged-template `each`, options via a variable / spread / computed key / `retry`, runner aliases (`const itDb = it.skip`, `it.extend`, `(it.skip)(...)`), a chain moved into an existing `it.skip`/`it.fails` test, renames across config-only projects (utc/rome globs) or into excluded dirs (`dist/`, `node_modules/`), `.spec.ts`/`.test.mts` outside `_test`, `const { skip } = ctx` in the body, and never-run assertions (early return, try/catch, `Effect.catchDefect`, un-yielded `Effect.sync`, forked fiber, dropped `await` before `expect.poll`/`vi.waitFor`).
- To show a known gap is not used by the real diff, run script variants and compare flagged `file:line` sets with the original: key chains by enclosing test titles (cross-test moves), and map every `yield* X` to `await X` (the residual must be exactly the non-mechanical exception categories). Scan base vs head for assertions under swallowing constructs with a 40-line AST script.
- A probe whose setup command fails (`git mv -q` does not exist) commits nothing and prints "ok, 0 test file(s) checked": treat 0 files checked as a broken probe, not a slip.
- To check helper rewrites (Cause shape, clocks), run the same table on effect 3 (scratchpad `e3probe`) and effect 4 in one vitest probe file, and count the reads of a stepping clock in an Effect-3 copy and the head copy.

**Why:** the AC5 guard in the td3 PR passed all of the first three cases silently, because it strips every whitespace character from normalized chains and compares whole files as a multiset.

An Effect-3 copy of a pre-upgrade commit works with `git archive <sha>` plus per-entry symlinks to a sibling worktree's `node_modules` that still has effect 3, and `cp -R -P` of its `packages/*/node_modules`. Run mutants from python through `/usr/bin/arch -arm64 <node> node_modules/vitest/vitest.mjs`, because python starts the x64 node, rollup dies, and every mutant looks killed.

**How to apply:** build the scratch repo under the scratchpad with a copy of the script, and symlink node_modules next to the copied script so `typescript` resolves. In zsh, write `${sha}:path` with braces, because `$sha:a` triggers the `:a` modifier.
