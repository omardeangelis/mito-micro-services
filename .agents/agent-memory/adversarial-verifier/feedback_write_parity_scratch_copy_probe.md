---
name: write-parity-scratch-copy-probe
description: Base-vs-head write differential in a scratch copy - build node_modules so @mito points into the copy, re-seed ctx per HTTP run, mask DB now() on pg
metadata:
  type: feedback
---

For a base-vs-head write-path parity probe (pratiche-effect, 2026-10-25), what worked and what nearly gave false results:
- **Scratch copy layout.** Symlinking the whole `node_modules` makes `@mito/*` resolve into the repo, so `vi.mock("@mito/server/auth")` misses the copy's relative `../auth` import. Instead: rsync without `/node_modules`, `mkdir node_modules`, symlink every entry except `@mito`, and `cp -R` the `@mito` folder (its links are relative, so they point into the copy). Nested `packages/*/node_modules` hold only relative `@mito` links: rsync copies them as they are.
- **Both sides in one run.** Put `git show <base>:.../PUT/index.ts` beside the head file as `base.ts`, minus anything importing removed files. Mount both under `createTRPCRouter({ base, head })`. Snapshot full rows after the in-process call, then reseed and repeat over HTTP (`fetchRequestHandler` with a superjson body).
- **Pitfalls.** (1) The factories' user ids come from a counter, so the HTTP run needs a ctx built from the *second* seed, or every operator procedure gives a false BAD_REQUEST. (2) `JSON.parse(JSON.stringify(undefined))` throws: wrap `norm` for `undefined` results, or `void` procedures show up as errors. (3) On postgres-js, DB `now()` defaults (`lastImportUpdate`) aren't faked: mask today's wall-clock timestamps before diffing, or every case DIFFs. (4) Use an operatorId in smallint range (32000) for FK cases, or you test a range error instead.
- **Sensitivity.** Run a 14-mutant battery (drop `[0]`, `asVoid`, `.returning`, id guards, set-id passthrough) with a python `count == 1` runner. Everything died except "skip the query when the list is empty", which is observably equivalent.

**Why:** a broken harness reads as either "all SAME" or "all DIFF". Each pitfall above showed up on the first run.

**How to apply:** reuse this recipe for any "inline Drizzle -> query + runTrpc" write move. Pair it with [[inline-to-runtrpc-error-differential]] and [[router-type-contract-differential]].
