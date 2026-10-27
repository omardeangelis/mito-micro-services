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
- To check helper rewrites (Cause shape, clocks), run the same table on effect 3 (scratchpad `e3probe`) and effect 4 in one vitest probe file, and count the reads of a stepping clock in an Effect-3 copy and the head copy.

**Why:** the AC5 guard in the td3 PR passed all of the first three cases silently, because it strips every whitespace character from normalized chains and compares whole files as a multiset.

An Effect-3 copy of a pre-upgrade commit works with `git archive <sha>` plus per-entry symlinks to a sibling worktree's `node_modules` that still has effect 3, and `cp -R -P` of its `packages/*/node_modules`. Run mutants from python through `/usr/bin/arch -arm64 <node> node_modules/vitest/vitest.mjs`, because python starts the x64 node, rollup dies, and every mutant looks killed.

**How to apply:** build the scratch repo under the scratchpad with a copy of the script, and symlink node_modules next to the copied script so `typescript` resolves. In zsh, write `${sha}:path` with braces, because `$sha:a` triggers the `:a` modifier.
