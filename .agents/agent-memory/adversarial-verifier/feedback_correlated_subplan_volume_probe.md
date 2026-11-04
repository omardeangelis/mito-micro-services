---
name: correlated-subplan-volume-probe
description: An EXPLAIN on a local seed can understate a correlated subquery in ORDER BY; read SubPlan loops and re-probe at plan volume on temp tables in a rolled-back tx
metadata:
  type: feedback
---

A correlated subquery in an ORDER BY key runs once per row that reaches the CASE branch, before LIMIT. A seed EXPLAIN that looks cheap may only run it a few hundred times (seen: loops=720 of 8k rows), while plan volume runs it ~50k times (25 ms -> 110 ms jit off, ~300 ms jit on).

**Why:** the notes reported "8.7 ms jit off" from a seed with few queue-state rows; the volume claim was not evidenced.

**How to apply:** read `SubPlan ... loops=` in the plan; then `BEGIN; CREATE TEMP TABLE ... ON COMMIT DROP; generate_series at plan volume; ANALYZE; EXPLAIN ANALYZE; ROLLBACK;` via `docker exec -i <pg> psql` (no persistent writes). Compare with/without the key and jit on/off, and try a pre-aggregated join as the alternative before suggesting it (here it was not much faster).
