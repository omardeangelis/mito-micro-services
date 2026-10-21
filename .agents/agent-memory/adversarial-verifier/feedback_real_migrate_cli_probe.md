---
name: real-migrate-cli-probe
description: Run the real drizzle-kit migrate CLI on a private local DB, not only the programmatic migrator; 0.31 hides every error, and xmin shows one transaction
metadata:
  type: feedback
---

To check a production migration run, run `node <repo>/node_modules/drizzle-kit/bin.cjs migrate --config <scratch>/drizzle.config.ts` with the cwd in a scratch dir. drizzle-kit loads `.env` from the cwd, so never run it from the repo root. Use a config that only has `dialect`, `out` (a copy of the migrations) and a `url` for a private `mito_rev_*` DB. Build that DB with `migrateWithPushedSchema` up to production's last migration, then clone one DB per scenario with `CREATE DATABASE x TEMPLATE base`.

- drizzle-kit 0.31 `renderWithTask` catches the error and calls `process.exit(1)` without printing it. The only output is the spinner line, so a RAISE, a lock timeout and an auth error all look the same. drizzle-kit 0.24 printed the error (`console.error` in the command's catch). A plan that says "it stops with a clear error" or "if it fails with message X" does not hold for `db:migrate:prod`.
- One transaction: the new `drizzle.__drizzle_migrations` rows and the rows they wrote all have the same `xmin`.
- A migration skipped by a high-water mark still prints "migrations applied successfully!". Only `max(created_at)` and the objects it creates show the skip.
- drizzle-kit uses the `pg` driver when it is installed. Tests often use postgres-js or PGlite.
- drizzle-kit 0.24 refuses to run against drizzle-orm 0.45 ("outdated"). To compare versions, read the source.

- The migrator reads `ORDER BY created_at DESC LIMIT 1`, and Postgres sorts NULLs first on DESC. One row with NULL `created_at` makes it re-run every migration from idx 0 (it failed safely on an ALTER, exit 1), while `max(created_at)` still looks right. A runbook check needs `count(*) WHERE created_at IS NULL` = 0 next to `max`.
- Scenario recipe that worked: a tsx builder in the private worktree (`migrateWithPushedSchema` + postgres-js, seed rows), `CREATE DATABASE x TEMPLATE base` per scenario, a background `psql` holder (`BEGIN; SELECT/UPDATE ... WHERE false/FOR UPDATE; pg_sleep(15)`), then the CLI with `env -i PATH HOME`. Read which statement failed from `docker logs` (other reviewers' errors are mixed in; match by statement text).
- `git ls-remote origin refs/heads/dev` shows the live remote without a fetch; the commit is often already in the shared object store, so `git diff --stat HEAD <sha> -- src/server/db/migrations` checks for a journal clash.

**Why:** in the PR6 T6.9 pass the tests ran the migrator from code, where the error message is visible. Only the real CLI showed that the operator would see no reason for a failure.

**How to apply:** every charter about a production migration command gets one CLI run per outcome: success, failure (guard), and skip. Compare it with what the runbook says the operator will see. See [[migration-high-water-mark-and-partial-merges]].
