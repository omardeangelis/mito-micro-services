---
name: worktree-gate-substitutes
description: How to run the literal next lint and the pg vitest project from a nested worktree; a green next build does not prove lint there
metadata:
  type: feedback
---

In a worktree nested inside the main checkout, `next lint` crashes (`Plugin "prettier" was conflicted`) and `next build` prints the same line at its "Linting and checking validity of types" step, then still exits 0. A green build in that tree proves nothing about lint. A bare `eslint --no-eslintrc -c .eslintrc.cjs` is only a substitute: pass `--ext .js,.jsx,.ts,.tsx` and count the files in `--format json`, or it may lint no TS at all.

To run the literal gate: `git archive HEAD | tar -x -C <mktemp outside the repo>`, symlink the worktree's root `node_modules` and each `packages/*/node_modules` (and `apps/*/node_modules`) into it, then `SKIP_ENV_VALIDATION=true pnpm exec next lint` there. It printed "No ESLint warnings or errors". The archive has no parent `.eslintrc.cjs`, which is what removes the conflict.

The `pg` vitest project is skipped without `TEST_DATABASE_URL` (23 files). Run it for real with a throwaway `docker run -d --rm -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:<private port>:5432 postgres:15` (image is usually cached), `pnpm run test --run --project pg`, then `docker rm -f` it. Do not reuse the project's own `mito_local` container (it holds 54329; `cronCli.test.ts` skips because of it). Check the container for leftover `mito_test_%` databases before removing it. The two perf files are opt-in and skip by design.

**Why:** AC26-style "every CI gate green" claims were otherwise backed only by substitutes.
**How to apply:** in any gate check in a nested worktree, state which gates ran literally and which by substitute. Related: [[gate-exit-capture]], [[gate-clone-and-doc-count-scope]].

**Doc status labels:** when an AC names a tech-debt status (`[OPEN]`) and the doc's own legend says `[PREVISTO]` until the step is in `dev`, the PLAN may have chosen the legend (here D21) without amending the SPEC. Report the label mismatch as MINOR and name both sources.
