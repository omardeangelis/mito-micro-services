---
name: suite-date-shift-and-edge-bound-mutants
description: Shift the real date for whole test suites with an offset Date class in a scratch copy's setup (time keeps running, log installs to a file); call-site Rome-bound mutants survive mid-window fixtures
metadata:
  type: feedback
---

To prove "no test depends on today's real date" across a whole suite: in a scratch copy, prepend `import "./fakeNow"` to the setup file(s) (`src/test/setup.ts`, `apps/web/src/test/setup.ts`); `fakeNow.ts` replaces `globalThis.Date` with a subclass whose `now()`/no-arg constructor add `Date.parse(FAKE_NOW) - realNow` (time keeps advancing, unlike `vi.useFakeTimers`). Vitest hides console output of passing files, so append each install (pid, TZ, date) to `FAKE_LOG` and count lines = test files. Positive control first: one `HttpRouter.toWebHandler` request whose status flips with the date (200 at real today, 400 at FAKE_NOW two days earlier).

**Why:** 2026-10-30 pagina-analisi round 2: 5 fake dates x server/domain and 3 x web, all green, installs matched file counts; without the control and the log the run would prove nothing.

**How to apply:** also mutate the call sites of day boundaries, not just the helpers: `today` computed in UTC instead of `romeDay`, and `periodBounds(range)` replaced by UTC midnights, both survived because every fixture sits mid-day/mid-window (NOW 11:00Z, rows on the 5th-14th). Kill needs a row at 22:30Z of the day before `from` and a NOW after Rome midnight. Also: a copy can capture another pass's in-place mutant (a web file differed from the repo seconds later): `diff -rq` the copy against the repo after a surprising failure. Related: [[day-rule-tests-and-tz-matrix]], [[webhandler-real-clock-time-bomb]], [[disabled-message-and-x64-runner]].
