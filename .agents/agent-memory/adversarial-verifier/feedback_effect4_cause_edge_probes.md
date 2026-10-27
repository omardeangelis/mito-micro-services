---
name: effect4-cause-edge-probes
description: How to check Effect 3->4 edge error mapping (failureOption->findErrorOption, catchAll->catch, either->result); probe programs, not only hand-built causes
metadata:
  type: feedback
---

Run one probe script twice, through a per-version `adapter.mjs` (v3 and v4 node_modules symlinked into sibling dirs). Feed it two kinds of input:
1. hand-built causes: Fail, Die, Interrupt, Fail+Die in both orders, two Fails;
2. real programs: `fail.pipe(ensuring(die))`, `acquireUseRelease` with a release that dies, `forEach` with concurrency where one item dies and one fails, `tryPromise` with no `catch`, and `runPromise` that rejects.

**Why:** in a 2026-10-27 review, the hand-built causes gave the same `findErrorOption`, `findDefect`, `catch`, `result` and `match` outcomes in both versions. Only the real programs showed the differences:
- The v4 runtime turns a typed Fail into a Die when a finalizer or a concurrent sibling dies (`internal/effect.ts` `causeElectDefects` at the ensuring and forEach sites). After that, `findErrorOption` returns None where v3's `failureOption` found the error.
- Interrupt-only `squash`: v3 gives `InterruptedException`, v4 gives `Error("All fibers interrupted without error")`.
- `tryPromise` with no `catch`: v3 `UnknownException` becomes v4 `UnknownError`, with a different message. This changes Sentry grouping.
- `runPromise` rejects with the raw error in v4, not with `FiberFailure`.
- `orElseSucceed` recovers an interrupt-only cause in v3 but not in v4.
- On a Fail+Die cause, `catchTag`/`catchIf` catch in v3 and die in v4. In v4 that cause can only come from an explicit `failCause`.

**How to apply:** for each divergence, grep for its trigger (ensuring, onExit, acquire*, addFinalizer, concurrency, interrupt/race/timeout/Fiber, tryPromise without catch) to judge whether it is reachable. Then check whether the SPEC lists it. A printer that groups v3 failures before defects reports a different order that does not exist: compare outcomes, not printed order. See [[effect4-vitest5-upgrade-probes]].
