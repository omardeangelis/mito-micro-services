---
name: out-of-tree-vitest-probe
description: Run throwaway probe tests on both PGlite and real Postgres from a mktemp dir, without copying the repo or touching its files
metadata:
  type: feedback
---

To probe a procedure on both drivers without writing in the repo: mktemp dir with
`node_modules` symlinked to the repo's, the probe files in `<tmp>/t/` (`*.db.test.ts`,
`*.pg.test.ts`, shared body in `<tmp>/body.ts`), and a `<tmp>/vitest.workspace.ts`
that spreads the repo's `vitest.config`, sets `root: <repo>`, `test.dir: <tmp>/t`,
absolute `setupFiles` (`src/test/setup.ts`, plus `src/test/pg.setup.ts` for pg) and
`server.fs.allow: [repo, tmp]`. Run from the repo with
`NODE_ENV=test TEST_DATABASE_URL=... ./node_modules/.bin/vitest --run --workspace <tmp>/vitest.workspace.ts`.
`@/` aliases and the `@mito/db` mock apply (symlink resolves to the same module ids).

**Why:** a rollback/SQLSTATE-mapping claim needs evidence on postgres-js, and repo
pg tests often cover only one of several mappings; rsyncing a scratch copy is slower.

**How to apply:** for each error branch of a transactional write, one case per driver
that snapshots tables before/after and prints `code`, `message`, `cause`; also call the
service with `Effect.provide(DbLive)` to see the raw `DbError` and driver class.
Related: [[mutant-battery-scratch-copy]].
