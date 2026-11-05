---
name: real-stored-shape-fixtures
description: Date fixtures at 09:00Z hide UTC-day mutants when the writer stores Rome midnight; a consumer of a shared day predicate needs its own window mutant
metadata:
  type: feedback
---

For a read that derives a day from a stored instant, check what the real writer stores before trusting the fixtures. `registerCall` stores a deadline at Rome midnight (22:00Z/23:00Z of the UTC day before), while fixtures use 09:00Z: a `toISOString().slice(0,10)` mutant of `dueDay` survived 48 green tests although it would be wrong on every real row.

A query that reuses a shared predicate (`isCallIn`) still takes its own window as an argument: mutate that argument per consumer (±5 days survived on `getMyDay` while the twin `listMyCalls` killed it).

**Why:** both survivors were invisible from reading the tests, which looked thorough on «Rome, not UTC».

**How to apply:** one UTC-slice mutant per derived day field, one wide-window mutant per query. Python-driven runs need `arch -arm64` ([[feedback_disabled_message_and_x64_runner]]), else every mutant "fails" with exit 1 on the rollup native module.
