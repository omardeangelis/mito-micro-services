---
name: list-query-mutant-patterns
description: Mutants that survive list/filter/count test suites on PGlite (join filter rows, empty branch of found/empty/missing, '' vs NULL, C collation) and a batch harness false survivor
metadata:
  type: feedback
---

Patterns that survived a 68-test list-query suite (filters, order, paging, count) while 60+ other mutants died:

- **"At most one joined row" guarded by a filter condition.** A cardinality test that seeds only extra rows the join filter already excludes (resolved alerts) does not kill a join on the foreign key that keeps the filter (`alert.task_id = task.id AND NOT is_resolved`). Seed an extra row that PASSES the filter (a second open alert not linked by `alert_id`) and check one row per parent and the total.
- **found / empty / not-found triads.** Tests often seed "found with rows" and "not found" but not "found with zero children". Then `leftJoin` -> `innerJoin` (empty becomes not-found) and `count(child.id)` -> `count()` (empty counts 1) both survive. Probe the empty branch.
- **NULLS LAST vs empty string.** `''` is a value: it sorts first ascending. If imports write `''` for missing text, "no value goes last" fails; NULLIF in the order is the fix.
- **PGlite collation is C** (`datcollate = C`), so text order tests run byte order; production is probably a linguistic collation. Mixed-case data and a `lower()` mutant survive; say the case/accent order is unverified.

Harness lesson: in a node `spawnSync` battery one mutant (filter dropped) came back 68/68 green although the write was confirmed; a by-hand rerun (perl, grep count, vitest) killed it. **Re-run every survivor by hand before reporting it**, and also by hand-check a few kills' failure names.

Related: [[feedback_mutant_battery_scratch_copy]], [[feedback_mutant_apply_verify]]
