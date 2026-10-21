---
name: sql-report-script-checks
description: Checks for a read-only diagnostic SQL gate script and its PGlite test - what READ ONLY does not block, tie-break fixtures need a non-HOT update, column-NULL battery, export-oracle differential, PGlite vs PG15 diff
metadata:
  type: feedback
---

For a read-only report script (counts SELECT plus one list per category) run by a person before/after a migration:

- **READ ONLY wrapper is weaker than it looks.** `SET TRANSACTION READ ONLY` refuses writes, nextval, data-modifying CTEs and `SELECT ... FOR UPDATE/SHARE`, but ALLOWS `LOCK TABLE ... IN EXCLUSIVE MODE` and `pg_advisory_xact_lock`. So "no lock that blocks writers" is proved by `pg_locks WHERE pid = pg_backend_pid()` after running the script in the same transaction (PGlite and PG15 both showed only AccessShareLock), not by the harness. A stray separate LOCK statement is caught only because the result-array destructuring shifts.
- **Tie-break mutants on an ORDER BY survive small fixtures.** Plan was a bitmap scan on a partial unique index; qsort of presorted input keeps heap order; a plain `UPDATE ... SET priority` is a HOT update and does NOT change bitmap order (root line pointers). A non-HOT update (toggle the indexed predicate column `is_active` false then true on the lowest-id row) flips it: mutant `ORDER BY closed_at` gave [1001,1002,1000] vs pristine [1000,1001,1002]. Use that in the fixture.
- **List order is often asserted only through `ids()` that sorts.** Check which lists use an order-sensitive `toEqual` on the mapped array; the others survive `ORDER BY` removal/reversal.
- **Column battery:** one mutant per select-list line (`expr AS "col"` -> `NULL AS "col"`, plus NOT for booleans, name/surname swap, drop COALESCE fallback) via a line-number runner; equivalent survivors are `LEFT JOIN`<->`JOIN` and `NULLIF` where a WHERE already excludes the NULL side. Use it to check a tech-debt claim "columns not all asserted": it was stale (all killed).
- **Oracle differential for a duplicated predicate:** run the real `closedCalls` (runServer, ADMIN user, wide interval) over a full grid before/after simulating the migration UPDATE; entered rows must equal the gate's list. Cheap, settles "does the gate match the export".
- **PGlite vs real PG diff:** one shared seed/normalize module imported by a `.db.test.ts` and a `.pg.test.ts`, each dumping JSON to `PROBE_OUT`; normalise timestamps (driver formats differ), compare in row order.
- **Each statement alone:** strip `--` lines, split on `;` (comments contain `;`), run each in RO, compare with the combined run.

Related: [[feedback_equal_counts_swap_mutants]], [[feedback_mutant_battery_scratch_copy]], [[feedback_list_query_mutant_patterns]]
