---
name: equal-counts-swap-mutants
description: A counts-row test whose categories all equal 1 (or the same value) cannot see a swapped FILTER predicate; also check that each list's is_active/NULL-state clause has a fixture row that only that clause excludes
metadata:
  type: feedback
---

A diagnostic SQL script with one "counts" SELECT (a, a2, a2_esportabili, b, c) and one list SELECT per category was tested by a mixed fixture with `toEqual({a:5, a2:3, a2_esportabili:1, b:1, c:1})`. Swapping the FILTER predicates of b, c and a2_esportabili in the counts SELECT survived (7 of 7 swap mutants green), because the three values were all 1 and the lists are separate statements with their own predicates. The counts row is what a person reads to decide a release.

**Why:** a fixture that gives two categories the same count proves the totals, not which rows each total counts.

**How to apply:** for any report-style query, list the expected value per category and flag equal pairs; run a swap-pair mutant (exact-pair python runner, count==1 check, private `git worktree add --detach` + node_modules symlink, restore with cmp). Also check, per list, that a fixture row exists which ONLY that list's `is_active` / `state <> 'x'` clause excludes (here the inactive fixture rows could never reach lists 4, 5, 6, so dropping `is_active` there survived) and that no fixture has `state` NULL (a `IS DISTINCT FROM` mutant survived). Column values of lists (only `contatto_id` asserted) survive `NULL AS col` mutants.

**Probe that worked:** differential test of the script's "exportable" flag against the real `closedCalls` (runServer + ADMIN user, wide interval) over a full grid (customer operator x contact operator x every enum state + NULL x closed_at set/null), simulating the realign UPDATE and diffing the export before/after: entered rows == a2_esportabili, none left. Settles "does the script's definition match the export" in one run.

Related: [[feedback_vacuous_test_patterns]], [[feedback_mutant_battery_scratch_copy]]
