---
name: frozen-testclock-probes
description: How to find tests that it.effect left on a TestClock frozen at 0, and which mutants show the lost (and gained) sensitivity
metadata:
  type: feedback
---

When a PR moves tests from a real clock to `@effect/vitest` `it.effect`, instrument `node_modules/.pnpm/effect@*/node_modules/effect/dist/testing/TestClock.js` in a private worktree (check `stat -f %l` is 1, so it is a copy, not a store hardlink; keep a backup and restore). Log `currentTimeMillisUnsafe` reads while `setTime`/`adjust` was never called, and `sleep` calls, with `globalThis.__vitest_worker__.current.name` to a file from an env var. Stacks are useless (fiber run loop); the frame `Schedule.js` means a retry schedule, `internal/effect.js:3173` a logger timestamp.

**Why:** (2026-10-27, effect-4 PR 3) the probe found the only semantic frozen-0 reads: an elapsed-time budget (`now - start`) and an in-process delay (`at - now`, with `at: new Date(0)`). Sign-flip mutants (`start - now`, `now - at`) were killed on the base (real clock) and survived on the head; the boundary mutant `elapsed > budget` did the opposite (frozen 0 kills it, real clock does not).

**How to apply:** run each sign mutant and each boundary mutant on base and head worktrees; report a shift, not a pure loss. Check the setTime calls are load-bearing by deleting them (expect failures) and that `it.live` choices are load-bearing by flipping them to `it.effect` (a Schedule retry times out at 5 s; an it.live kept only for an AC rule may still pass). Then show the proposed fix (`it.live`) kills the surviving mutant. zsh: pass test lists as arrays, not a string. Related: [[effect4-vitest5-upgrade-probes]], [[mutant-apply-verify]].
