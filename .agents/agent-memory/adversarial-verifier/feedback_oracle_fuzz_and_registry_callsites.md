---
name: oracle-fuzz-and-registry-callsites
description: Seeded fuzz with a JS oracle for read aggregates; print seed counters to prove the fixture reaches each branch; test harness registry 9999 hides call-site registryAt mutants
metadata:
  type: feedback
---

For a read service that aggregates many definitions (team numbers), a 40-seed fuzz in one `*.db.test.ts` with a JS oracle written from the spec settles agreement in seconds, and the same file runs on real Postgres by swapping the imports to `@/test/pg` (`pgDb as db`).

**Why:** the first fixture agreed on all seeds but reached `inactive 0, never 0`: it was vacuous for those branches. Only the per-seed counters showed it. Under `it.effect` `console.log` goes to TestConsole, so write counters with `process.stderr.write`.

**How to apply:** print one counter per branch and sum them; run a survivor mutant as negative control. The test harnesses set `calls_registry` to 9999, so every mutant passing a far-future `registryAt` at a call site survives the repo suite: set the milestone to a real instant in the probe. An oracle that excludes `at >= now` while the service reads to the end of the day fails when a fixture puts a call exactly at `now`: a probe artifact, not a bug. Related: [[feedback_mutant_battery_scratch_copy]], [[feedback_disabled_message_and_x64_runner]].
