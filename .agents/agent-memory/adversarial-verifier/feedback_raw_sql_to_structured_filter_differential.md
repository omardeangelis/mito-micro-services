---
name: raw-sql-to-structured-filter-differential
description: Proving a raw-SQL filter builder and its structured replacement give the same rows - probe hook, value battery, engine split, LIKE backslash
metadata:
  type: feedback
---

When a client-built SQL string (`sql.raw`) is replaced by validated structured filters, run a per-tuple differential through the real procedure, not only the expected-set tests:
- In a scratch worktree, add an optional `probeSql` input that goes back into the same `and(...)` through `sql.raw`. Feed it the old builder's output (copy the base file) and feed `advancedFilters` the parsed tuple. Compare ids plus `total`, and record old errors separately.
- Use a battery for each column kind: text (`%`, `_`, `\`, `x\`, `'`, accents, spaces), int (`+30`, ` 30 `, `030`, `30.0`, `3e1`, `1_0`, `0x1E`, range edges), decimal (`1e3`, `Infinity`, `NaN`, `200.`, `.5`), date (Rome-midnight and DST seeds, `today`, `20260115`, `2026-1-5`), and enum (case, spaces), with all operators plus bogus ones.
- Run it on real PG with `prepare: false` and a `TimeZone: Europe/Rome` pool, as prod does, and also on PGlite with `SET TIME ZONE`. PGlite is PG16 and accepts `1_0`/`0x1E` integers, while local PG15 rejects them. The two engines' diff sets differ, so name the engine for each finding.

**Why:** In the filtri-sql-sicuri pass this found the one difference the plan doesn't list: `\` in a text value was a LIKE escape before and is literal now. It also confirmed that the date bound as an untyped postgres-js param (type 0) matched the old literal in every boundary case.

**How to apply:** Run this for any "same results as before" AC on a filter or query rewrite. Classify each diff as old ERR (allowed), listed in the plan, or unlisted (a finding).
