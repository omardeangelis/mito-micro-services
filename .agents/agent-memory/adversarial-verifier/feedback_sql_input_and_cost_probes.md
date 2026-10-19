---
name: sql-input-and-cost-probes
description: How to check that a Drizzle list query parameterizes input and has bounded cost - toSQL marker sweep, apostrophe kills a sql.raw mutant, alternating (not identical) array values to measure OR-arm blowup, PGlite param-limit corruption
metadata:
  type: feedback
---

Checks that worked on a filtered list query (Drizzle + Zod input):

1. **Parameterization:** build the real query with the exported where/order builders and `.toSQL()` for every orderBy x direction x dateField, with marker strings (`MRK'); DROP…`) in every text input; assert the marker, the numbers and the dates appear only in `params`. Cheap and covers dynamic ORDER BY.
2. **Regression guard:** a mutant turning the ILIKE param into `'${sql.raw(pattern)}'` passes tests that only search `%`, `_` and `\` (with standard_conforming_strings both forms behave the same). Only an apostrophe search (`d'ang`, common in Italian surnames) kills it. Ask for that test.
3. **Array cost:** Postgres collapses identical OR arms (`process_duplicate_ors`, after params fold to consts), so `priorities: ["low" x1000]` looks cheap. Alternate two values (`low, medium, …`) and seed rows that match neither: 1000 arms on 70k rows took 2.4 s vs 112 ms baseline in PGlite. IN lists (`inArray`) are hashed, duplicates or not: cheap.
4. **Size bound over HTTP:** tRPC v10 queries are GET only, so arrays are capped by the URL (Node `http.maxHeaderSize` 16384; ~1000 alternating band strings when URL-encoded). The 65,534-param limit (postgres-js `MAX_PARAMETERS_EXCEEDED`) is reachable only in-process.
5. **PGlite pitfall:** ~65k bind params makes PGlite throw `RangeError: Invalid array length` and leaves the client broken for later tests in the same file; run that probe last or alone.
6. **Seeding volume:** `testClient.exec` with `INSERT … SELECT … FROM generate_series` (give every NOT NULL column, e.g. customers `source`) seeds 70k rows in seconds; compare ratios, not absolute times.

**Why:** the code was correct but nothing pinned it, and the only real resource gap (duplicate bands) was invisible with identical duplicates.

**How to apply:** for any new filter input, run 1–3 before judging; report the URL-bounded worst case with a measured ratio. Use a unique `mktemp -d` scratch dir: a generic `scratchpad/copy` was wiped by another verifier's `rsync --delete` mid-run ("No test files found").

Related: [[feedback_mutant_battery_scratch_copy]], [[feedback_real_caller_probe_and_kill_reason]], [[feedback_read_mirrors_write_differential]]
