---
name: retention-constant-change-probes
description: How to check a change to a retention/cutoff constant that drives a cron DELETE; seed pg tests hide behind skipped pg project; cutoff-vs-selectable-day sweep
metadata:
  type: feedback
---

When a constant that drives a cron (retention months, cutoff) changes, grep every consumer of the cron's *effect*, not only of the constant: the local seeder's manifest/verify predicts what the real cron deletes (`L1`, `volumi` counters) with its own hardcoded number. Those checks live in `*.pg.test.ts`, which the root run skips without `TEST_DATABASE_URL`, so a "root tests green, N skipped" claim (and an implementation note saying "its tests pin 3 and stay green") can hide a red CI Test job. Run them on a throwaway pg15 (see [[worktree-gate-substitutes]]) and read which scenario ids fail.

For an instant-based cutoff (`subMonths(now, n)` in TZ=UTC) next to a Rome-day selectable range (`romeDay(now) - n months + 1 day`), sweep `now` every 15 min over several years in TZ=UTC and TZ=Europe/Rome and count instants where the cutoff passes Rome midnight of the first selectable day. Spills appear only at 22-24 UTC (month-end clamp when UTC day is the day before Rome's, and DST mismatch 25 months back); check the scheduler's UTC time and whether the job is rerunnable (Force run) before grading.

**Why:** a 3->25 change left the seed manifest at 3; three pg tests failed while the author's gate log was green.
**How to apply:** any retention/cutoff diff: grep the job name across seeds/verify, run the pg project, run the sweep.

Round 2 lessons (seed widened to follow the constant): a test whose bound imports the generator's own constant (`LOG_HISTORY_MONTHS`) cannot catch a change of it, so the SPEC literal ("6 mesi prima del confine") is unpinned: run a mutant on that constant and expect it to survive. Widening a generator's time horizon also breaks cross-entity coherence the tests don't check: count log rows older than their actor operator's createdAt, and contacts older than their customer, base vs head (pure `generateDataset` from a scratch copy with a node_modules symlink, `.mts` for top-level await). copyCheck.pg hook timeouts at load ~25 are flakes: rerun the file alone.
