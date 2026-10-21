---
name: data-migration-row-differential
description: How to prove which rows a hand-written UPDATE migration touches - to_jsonb minus column, xmin vs xmax, ghost FK rows, seeded oracle fuzz
metadata:
  type: feedback
---

To prove a data migration moves exactly the intended rows and changes only one column:

- Snapshot `(to_jsonb(t) - 'col')::text` plus `xmin::text` per row before and after. The jsonb text keeps microseconds; Drizzle rows map timestamps to JS Date (ms), so a repo test comparing Drizzle objects lets a sub-millisecond `updated_at` change through (a `+ interval '1 microsecond'` mutant survived such a test).
- An unchanged `xmin` means the row was not written, not even a no-op write. A changed `xmax` alone is NOT a write: FK checks of a child INSERT/UPDATE take FOR KEY SHARE on the parent row. I first read `customersSame: false` as "migration writes customers"; it was only xmax. Compare content + xmin, and pass the xmax lead to the lock pass (KEY SHARE conflicts with FOR UPDATE, so it can matter for lock order).
- Seed rows whose FK target is missing ("ghost" parents) with `SET LOCAL session_replication_role = replica` in one transaction (PGlite and PG superuser both accept it).
- A seeded fuzz with a JS oracle (several seeds, NULLs on both sides, several tasks per parent, orphans, ghosts) compared to the moved set, to the read-only script's list and count, and to the log rows. Then kill-check the fuzz with 3-4 SQL mutants (`<>` for IS DISTINCT FROM, dropped filter, extra SET) before trusting its green.
- Port the same file to the real-Postgres vitest project by shimming `query`/`exec` over `pgClient.unsafe`; `tx.unsafe(multiStatement)` returns one array per statement.
- Faster than a vitest port: a standalone `tsx` script in a `mktemp -d` folder with a `node_modules` symlink, importing `pushedSchema.ts` by absolute path, one private DB per seed (create, migrate to the tag, seed, snapshot, migrate, diff, drop). 12 scenarios in ~2 min; pass `MIGDIR` to run mutants on a copied migrations folder. Snapshot every public table (plus `drizzle.__drizzle_migrations`), not just the target ones.
- "Reads each row once" and "no user triggers": `EXPLAIN (ANALYZE, COSTS OFF)` of the CTE statement inside a transaction you roll back. It shows the CTE computed once (CTE Scan on both uses) and lists every trigger fired; only `Trigger for constraint ..._fk` lines means RI only.
- The repo tests usually check the parent table (customers) with Drizzle objects only: a sub-ms write to every parent row survives. Report it as a NIT on test strength only when your own xmin diff shows the real SQL does not write it.

**Why:** a single fixture per category, compared at ms precision, can pass while the migration touches extra rows physically or changes timestamps below a millisecond.
**How to apply:** any review of a hand-written data migration or bulk UPDATE; see [[vacuous-test-patterns]] and [[mutant-battery-scratch-copy]].
