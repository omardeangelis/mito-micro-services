---
name: effect4-vitest5-upgrade-probes
description: How to falsify an Effect 3->4 / vitest 1.6->5 upgrade plan with real-version probes; the traps that keep "same assertions" claims from holding
metadata:
  type: feedback
---

Probe the target versions directly instead of reasoning from migration docs: `npm install` effect@4 / effect@3 / vitest@5 / vitest@1.6 in separate scratch dirs, keep probe tests in another dir with a `node_modules` symlink, run `node <dir>/node_modules/vitest/vitest.mjs run --root <probe dir>`. Never pass `list` to vitest 1.6: it is not a command there, it becomes a filter and starts watch mode (kill it).

**Why:** a plan review (2026-10-27) found several blocking problems that only the probes showed. Each one came with an exact counterexample.

**How to apply:** for any upgrade plan that promises "same assertion lines", check these:
- v4 Cause is `{ reasons: [...] }`. Every `expect(exit.cause).toMatchObject({ error })`, `cause: { _tag: "Fail" }` or `exit.cause._tag` breaks, so assertion edits are unavoidable.
- In v4 the default ConfigProvider snapshots `process.env` on the first Config read, and it treats `""` as missing. A `vi.stubEnv` after an earlier read in the same file is invisible.
- `@effect/vitest` `it.effect` provides TestConsole, so `withLeveledConsole` output never reaches `vi.spyOn(console, ...)`. TestClock starts at 0 and blocks real `Schedule`/`sleep`.
- Converting to `it.effect` generators makes every `expect(await ...)` line illegal syntax. Count them.
- A line-based "expect( lines unchanged" checker cannot see multi-line matcher bodies.
- `git grep -E` on macOS git 2.50 ignores `\w`/`\b`, so the gates match nothing. Run every grep gate on the base and require hits (negative control).
- vitest 3+ `restoreAllMocks` only restores spyOn spies, not `vi.fn` history, so pinning `clearMocks: false` breaks suites.
- The default pool changed from threads to forks, so a `test.env.TZ` now applies.
- The fake-timer `toFake` default grew.
- `Cause.squash(failCause)` returns the same instance, so a "failure.value -> squash" mutant is equivalent.
- v4 elects a Fail to Die when a Die joins the cause (e.g. `Effect.fail(e).pipe(Effect.ensuring(Effect.die(...)))`): `Cause.findErrorOption` then returns None, where v3 `failureOption` found `e`, and `catchIf`/`catchTag` no longer catch it. A parallel fail+interrupt is unchanged. Probe both versions side by side by importing `node_modules/.pnpm/effect@3.x/.../dist/esm/index.js` and `effect@4.x/.../dist/index.js` in one node script. Then decide whether the code path can actually reach it: look for `ensuring`/`acquireRelease`/`addFinalizer`/scoped layers.
- vitest 1.6 compares Effect errors field by field (they are iterable), not by message only. Do not claim that vitest 5's stricter Error equality is a big change for them.
- Runtime/logger/clock charter (2026-10-27): run the same program on effect@3.22.2 and @4.0.6 from two scratch dirs (node_modules symlink to the .pnpm copy) and diff the captured console calls; probe the real queue/ServerLive files with tsx (.mts for top-level await; a file importing `@/` aliases fails under tsx, inline it). Check detached-fiber lifetime by interrupting the caller and by closing its scope, in both versions. A fixed Clock with `sleep: void` makes `Effect.timeout` never fire in v3 and v4 alike, so it is not a regression.
See [[plan-verification-techniques]], [[vacuous-test-patterns]].
