---
name: index-drop-migration-checks
description: How to verify a DROP INDEX migration and the "with/without index" numbers behind it - proxy predicates that disable more indexes than the drop, pg_locks probe, runbook lock-hunt patterns, regenerate from base
metadata:
  type: feedback
---

Checks that paid off on an index-drop migration (drizzle-kit 0.24, PGlite harness):

1. **Regenerate twice in throwaway copies** with `env -u NODE_ENV ./node_modules/.bin/drizzle-kit generate` (no `.env*` copied; `db:generate` has no NODE_ENV so `loadEnv` returns at once, and generate is offline). (a) As-is: only the known `customers.id` literal drift should appear. (b) From base (delete the new SQL + snapshot, trim the journal): SQL must equal the committed one plus the hand-removed lines, and the snapshot must differ only in `id` and the literal. `drizzle-kit check` validates the chain.
2. **"Without index" measured with a proxy predicate** (`COALESCE(is_active, false) = true`) disables *every* partial index on that predicate, including ones that stay (here the unique `task_customer_active_uidx`). A PGlite probe with ~84k seeded rows showed different plans: the proxy used `task_customer_id_idx` plus a merge join, and the real post-drop query used a bitmap scan on the uidx; times diverged up to 45% in both directions. Treat proxy numbers as estimates and ask for a post-apply measurement.
3. **Lock check:** in a PGlite transaction, `DROP INDEX` then `SELECT relation::regclass, mode FROM pg_locks WHERE pid = pg_backend_pid()` shows AccessExclusiveLock on the table. That lock blocks reads too, not only writes like CREATE INDEX. The drizzle migrator (`pg-core/dialect.js migrate`) runs all pending migrations in one transaction, so the lock lasts until COMMIT and CONCURRENTLY is impossible. Then check two things: that the migration sets `SET LOCAL lock_timeout`, and that the runbook's stuck-migration query (LIKE patterns on `pg_stat_activity.query`) matches the new statements' text.

4. **Real contention test, no PGlite limits:** Docker has local `postgres:16-alpine` images. Run `docker run -d --rm -p 127.0.0.1:<port>:5432`, migrate to the previous index with the node-postgres migrator plus the harness's pushed-schema pieces, and hold a lock with a `BEGIN; SELECT ...; SELECT pg_sleep(20)` session. Then run the real CLI from a clean scratch copy: `env -i PATH HOME SUPABASE_DB_CONNECTION_STRING=<local> drizzle-kit migrate`. This showed 55P03 after about 5 s, exit 1, nothing applied, and a concurrent reader stalled for the whole wait. So "lock_timeout avoids queueing" is only true up to the timeout. `docker stop` the container at the end.
5. **Name-filtered index tests** (`WHERE indexname IN (...)`) kill a missing drop but miss an extra index (mutant survived). Also check a runbook's "expected rows" against the exact query it cites: the cited G2 query never returns `_pkey`.
5b. **Re-review traps:** `drizzle-kit migrate` prints "migrations applied successfully" and exits 0 even when it applied nothing (a checkout without the file), so only a `max(created_at)` check proves it ran. A fix that adds a test makes every test count in the log stale; recount. For a rollback that is a plain `CREATE INDEX` with `SET lock_timeout`, probe it behind an open `UPDATE … WHERE false`: it blocks writers (not readers) until the timeout.
6. **Conditional decisions:** if the plan says "re-measure, and re-review with X if the times change", compare the log's own words ("a difference the preliminary missed") with a recorded confirmation from X after the re-measure.

**Why:** schema, snapshot and tests were all right. The real risks were in the procedure and in evidence that measured a different plan than the one production would run.

**How to apply:** any migration that drops or replaces an index, or any plan decision justified by "with/without index" timings.

Related: [[feedback_snapshot_structural_diff]], [[feedback_sql_input_and_cost_probes]], [[feedback_mutant_battery_scratch_copy]]
