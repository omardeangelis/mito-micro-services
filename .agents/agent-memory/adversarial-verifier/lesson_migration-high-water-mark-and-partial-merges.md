---
name: migration-high-water-mark-and-partial-merges
description: Check any release plan that offers a limited/cherry-picked merge against the migrator's created_at high-water mark; read the migrator source, do not assume
metadata:
  type: feedback
---

Drizzle's `pg-core/dialect.js#migrate` runs only migrations whose `folderMillis` is greater than the latest applied `created_at` (verified in node_modules for 0.45). A release plan that allows "merge limited to what must ship" is unsafe if it can leave out a migration older than one it ships: the omitted one is skipped forever once a newer one is applied, and the snapshot chain in `meta/` also embeds it.

**Why:** the PR6 plan (T6.7 step 1, section 13) offers a limited merge for non-Contatti commits (GCP work, which includes the `cron_run` migration) without this caveat.

**How to apply:** for every release/rollback step touching migrations, open the migrator source, list the journal order (`src/server/db/migrations/meta/_journal.json`) and ask what happens if any single migration is missing, reordered, or applied late. Also check what `SET LOCAL` settings (lock_timeout) leak into later migrations of the same one-transaction run.
