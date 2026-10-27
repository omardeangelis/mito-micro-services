---
name: tx-combinator-version-differential
description: Compare a transaction combinator across library majors with a fake drizzle client in plain node; run a local survivor against the whole unit project before calling it a gap
metadata:
  type: feedback
---

To check that a rewritten `transaction` (runtime/context capture, die vs dieMessage, either vs result) behaves the same across Effect majors: when the old major is still in `node_modules/.pnpm` (another dep pulls it), write two .mjs files that copy base and head bodies verbatim, import each version by absolute dist path, and drive both with a fake client (`BEGIN`, cb, `COMMIT`/`COMMIT-FAIL`, `ROLLBACK` on throw). One JSON line per scenario: clock, service, log annotations + log span + min level via a capturing logger, parent span, typed-after-failed-query, recovered DbError, nested, interrupt inside, outer timeout, forked child, deadlock retry. Runs in about a second, no DB.

A mutant that survives the file's own suite (e.g. "typed error after a failed query becomes a defect") can still die in service suites (createPratica CONFLICT, deactivate deadlock retry): run it against `--project unit` over everything before reporting a test gap.

**Why:** version differentials on the real module need two installs; the fake client isolates the combinator's own logic, and the full-suite run avoids a false "untested" finding.

**How to apply:** pair with a scratch-copy mutant battery for the real tests ([[mutant-battery-scratch-copy]]); drive vitest from a bash loop, not python subprocess ([[disabled-message-and-x64-runner]]).
