---
name: shared-worktree-git-archive-copy
description: Parallel verifiers mutate the shared worktree mid-run; build the scratch copy from `git archive HEAD`, and read kill reasons of input-whitelist mutants
metadata:
  type: feedback
---

A first test run in the worktree showed 3 red tests at a "clean" HEAD: another verifier pass had a mutant applied in `services/practice/errors.ts` at that moment (`git status` showed `M`, mtime minutes old). Never trust a test run in the shared worktree during a multi-pass review.

**Why:** v1..v5 run in parallel on the same checkout; `rsync` of the working tree copies their mutants too.

**How to apply:** `git archive HEAD | tar -x -C <copy>`, root `node_modules` as per-entry symlinks with `@mito/*` relinked to the copy's `packages/`, `cp -R -P` of `packages/*/node_modules` (relative links). Run baseline green in the copy before mutants; check stack traces show the copy path.

Input-whitelist mutants (zod `.pick` on a write): (1) zod strips unknown keys, so a service that spreads input before the trusted value is an equivalent mutant at the router; pair "add key to pick" with "swap spread order" to test the assertion on that key. (2) A fixture value that violates an FK (e.g. `chatId: 999`) kills pass-through mutants by a driver error, not by the column assertion: read the kill reason. (3) Columns the test never sends (`updatedAt`, `reddito`) survive "add to pick" mutants. (4) `.min(1)` on an FK id often survives: the empty id hits the FK and maps to the same error code. Related: [[mutant-battery-scratch-copy]], [[pg-lock-mutant-runs]].
