---
name: webhandler-real-clock-time-bomb
description: A raw-request helper built on HttpRouter.toWebHandler runs on the real Clock, not the it.effect TestClock; date-dependent status tests pass only while the fixture NOW equals today
metadata:
  type: feedback
---

A `statusOf(userId, path)` helper (`HttpRouter.toWebHandler(HttpApiBuilder.layer(...))` + `web.handler(new Request(...))`) builds its own runtime: `TestClock.setTime` of the surrounding `it.effect` does not reach it. A 400 test for "two days after today" passed only because the fixture NOW (2026-10-30) was the real date; under `vi.useFakeTimers({ now: <tomorrow>, toFake: ["Date"] })` it failed (200 instead of 400).

**Why:** the spec examples are dated "today", so authors pick NOW = the day they write the test; the clock leak is invisible until the next day's CI.

**How to apply:** for any test that sends raw requests and asserts on a date-relative outcome, probe twice: (1) set TestClock far from today and send a window valid only for the real date (200 = real clock); (2) copy the file, add fake Date = tomorrow in `beforeEach`, rerun. Also read the bodies: raw-request helpers that keep only the status hide which error answered (schema 400 has an empty body, a tagged error has `{"_tag":...}`). Related: [[frozen-testclock-probes]], [[mutant-battery-scratch-copy]], [[disabled-message-and-x64-runner]] (python runner needs `arch -arm64`).
