---
name: distinct-value-fixtures-hide-distinct-aggregates
description: "Counts once" tests whose fixture amounts are all different (powers of 2) cannot see a sumDistinct/avgDistinct mutant, with or without the old join
metadata:
  type: feedback
---

A double-count fix (join on a link table replaced by `exists`) was pinned by tests whose every practice had a different amount (powers of 2, so "each sum says which rows counted"). The mutant "old join + `sumDistinct`/`avgDistinct`" (the classic wrong fix for join fan-out) and "exists + DISTINCT aggregate" both stayed green on all 131 tests; a 3-row probe with two equal amounts (1000, 1000, 4000) gave 5000/2500 instead of 6000/2000.

**Why:** all-distinct values make "count each row once" and "count each value once" indistinguishable. Same family as [[equal-counts-swap-mutants]], from the other side.

**How to apply:** on any sum/avg/count that claims "each X once", run a DISTINCT-aggregate mutant (drizzle `sumDistinct`, `avgDistinct`, `countDistinct`) both on the new query and on the old join shape; ask for one fixture with two rows of equal value. Related: [[mutant-battery-scratch-copy]], [[order-by-removal-survivors]].
