---
name: effect-fn-span-clock-reads
description: Effect.fn spans read Clock.currentTimeNanosUnsafe at start and end; a scripted test clock that advances on every read gets consumed and the test can pass vacuously
metadata:
  type: feedback
---

When a change wraps functions in a traced `Effect.fn` (Effect 4), look for hand-written `Clock` objects in tests whose readings come from one shared script (`times.shift()`) behind both the millis and the nanos methods. Span start and end call `clock.currentTimeNanosUnsafe()` (`TracerTimingEnabled` is on by default), so every traced call inside the program consumes scripted readings. The program then sees shifted times, and the test still passes for a different reason.

**Why:** in the 2026-10-28 review of Effect 4 PR 4, `apply.db.test.ts` "la scadenza che passa tra un blocco e l'altro" scripted `[0, 0, 2000]`. At base the reads were `ms 0, ms 0, INSERT batch, ms 2000`. At head they were `nsU 0, ms 0, nsU 2000 …`, so the import timed out before the first batch. A mutant that keeps a partially written import was killed at base and survived at head. The suite was green and the AC5 assertion guard saw nothing, because no assertion had changed.

**How to apply:** grep tests for `currentTimeNanosUnsafe` and `Clock.Clock`. Label each clock method's reads in a file log (`appendFileSync`, since vitest swallows console output here) and add one log line at the step the title names. Run the same test at base and head, then confirm with one mutant that only the intended path can kill. Fix: return a constant from the nanos methods, or advance only on `currentTimeMillis`. Related: [[effect4-cause-edge-probes]], [[frozen-testclock-probes]].
