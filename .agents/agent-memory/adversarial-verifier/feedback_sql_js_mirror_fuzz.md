---
name: sql-js-mirror-fuzz
description: How to differential-fuzz a SQL expression that mirrors a JS function (regex for Number(), Rome month) in PGlite, and the harness traps that fake mismatches
metadata:
  type: feedback
---

To check a migration's SQL mirror of a JS helper: extract the CASE expression from the .sql file with a regex, load rows into PGlite in one `jsonb_array_elements` insert (row-by-row inserts are slow), compare against the real TS helper run with `node --experimental-strip-types`, under several session `timezone` values.

**Why:** a hand-checked list of 14 strings in node proves nothing about Postgres regex semantics.

**How to apply:**
- Use an `Math.imul` LCG; a float LCG (`seed * 1103515245`) loses precision and the "fill set to N" loop never ends.
- Print mismatches as code-point hex: JSON.stringify does not escape U+00A0 / U+FEFF, so "1e0 x" looks like an ASCII bug when it is NBSP (JS Number trims it, PG `\s` does not).
- Re-probe a suspicious case with the literal pulled from the .sql file, not a re-typed regex.
