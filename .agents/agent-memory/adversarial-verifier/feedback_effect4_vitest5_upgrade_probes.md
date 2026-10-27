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
- vitest 1.6 compares Effect errors field by field (they are iterable), not by message only. Do not claim that vitest 5's stricter Error equality is a big change for them.
See [[plan-verification-techniques]], [[vacuous-test-patterns]].
