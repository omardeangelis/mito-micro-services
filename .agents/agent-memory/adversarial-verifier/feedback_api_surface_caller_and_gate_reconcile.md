---
name: api-surface-caller-and-gate-reconcile
description: How to settle "no caller left for a removed/reshaped tRPC procedure" and "judge the supplied gate output" fast, without re-running the suite
metadata:
  type: feedback
---

**Dangling callers (removed or reshaped procedure).** tsc passing is not enough evidence on its own (untyped paths, string URLs, docs). Three cheap checks settle it:
- `git grep -nE "<names>" HEAD -- . ':!brain'` over the whole tree, not only `src` and `api` (also CI yml, smoke scripts); and the plan's own grep command run on HEAD, comments included.
- A script that lists the router keys from each `routers/*/index.ts` (`createTRPCRouter({...})` body) and compares them with every `api.<router>.<proc>.` reference in src and api. A nested-object router (supabase) gives one false "dangling"; check by hand before reporting.
- Router diff: if `git diff --name-status` shows only `task/index.ts` changed in the router files, the removed keys are exactly the ones in that diff.

**HTTP probe of the surface** (private worktree, scratch `*.db.test.ts`, `GET`/`POST` from `app/api/trpc/[trpc]/route`, `getServerAuthSession` mocked): removed procedures answer 404 `No "query"-procedure`, an old-shaped input is stripped by zod and answers 200, a mutation returning void answers `{"json":null,"meta":{"values":["undefined"]}}`, typed errors carry `data.contactError`. About 60 lines, one run.

**Reconcile the supplied gate output instead of re-running it.**
- `git ls-files 'src/**/*.test.ts' 'src/**/*.test.tsx' 'api/**/*.test.ts' | wc -l` should equal passed + skipped files (here 127 + 3 = 130).
- Skipped tests are the `describe.skipIf(!hasTestDatabase)` files of the `pg` project (the 3 files / 9 tests); the same number reappears as the pg run.
- `git diff --stat <gate commit> HEAD -- src api package.json pnpm-lock.yaml vitest.config.* .github` must be empty when the brief says "src identical to the gated commit".
- tsc in the repo rewrites `tsconfig.tsbuildinfo` (incremental): do not run it in the shared tree; use `--incremental false` or a private worktree.

**Deleted tests.** For each deleted test file, list what it exercised, then find the surviving test of the same shared hook or component (here `ContactRowState.test` pins the reject-after-unmount toast, `ContactStateControl.test` the alert-confirm dialog, `ContactAlertCloseButton.test` the focus after the X). A test of a deleted component is not coverage of behavior that ships.

Related: [[removed-params-focus-handoff-gates]], [[real-caller-probe-and-kill-reason]], [[authz-read-surface-probes]]
