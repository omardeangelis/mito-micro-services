---
name: pg-lock-mutant-runs
description: Running mutants against real-Postgres lock tests in the pnpm monorepo copy; cascade timeouts, isolate with -t; run the pre-fix file as a mutant
metadata:
  type: feedback
---

Three lessons from a lock-order mutant battery on `*.pg.test.ts` (deactivation review, 2026-10-22):

1. **Monorepo scratch copy.** Symlinking the whole `node_modules` is not enough: pnpm's `@mito/*` links are relative, so they resolve back into the original checkout and the mutant in the copy never runs for code reached through `@mito/server` (for example `createTestCaller`). Rebuild each `node_modules` in the copy as a real folder of per-entry symlinks, with `@mito/<pkg>` pointing at the copy's `packages/<pkg>`. Proof it worked: stack traces show the copy's path.
2. **Cascade.** One failing lock test leaves a held transaction (`holdCustomerLock` not released) and the rest of the file times out, so a mutant reports 10+ failures. Read kill reasons only from a `-t "<test name>"` run of the targeted test.
3. **Pre-fix file as a mutant.** For a fix that claims a race guarantee, run the new tests against the pre-fix source (`git show <base>:<file>`). Here the new pg race test passed on the old code; only an SQL-shape test failed, so the race property rested on statement shape, not on a real interleaving.

Related: [[feedback_mutant_battery_scratch_copy]], [[feedback_lock_order_mutants]]
