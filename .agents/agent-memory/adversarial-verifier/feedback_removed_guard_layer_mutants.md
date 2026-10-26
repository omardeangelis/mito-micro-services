---
name: removed-guard-layer-mutants
description: When a change drops one of two auth guards, mutate the remaining guard's call shape and order, base vs head; check middleware wiring with the build manifest
metadata:
  type: feedback
---

A change that removes one of two stacked guards (route `authCheck()` plus `protectedProcedure`) makes properties the dropped layer used to back up rest on the remaining one alone. The "401 without session" tests stay green, so they prove nothing about the other ways in.

**How to apply:**
- Mutate how the remaining guard is called, not only whether it is called. Here `authCheck()` → `authCheck(req)` opens the cron-JWT path. Run it in a base copy and a head copy with one probe that has no session and a valid token. Base: the dropped layer still blocks (TRPCClientError UNAUTHORIZED, storage untouched). Head: 200 with the file bytes. Then run the existing suites: the mutant survived all 50 tests.
- An order mutant (storage read before the guard, 401 after) survives when the 401 test doesn't assert that storage was left alone. A backend test that kills it only because its request has no name or no body (400/500 instead of 401) is an accidental kill: read the reason.
- Proxy the request (`get` trap on url/body/json) and wrap the guard and storage in an event log. One ordered `toEqual` on the events then proves auth comes first and is called with no arguments.
- Whether a `src/middleware/<x>.ts` folder file is a Next middleware: Next 14 only matches `^middleware\.(ts|js…)$` among the files of the app's parent folder. Confirm with `.next/server/middleware-manifest.json` (`"middleware": {}`) after a placeholder build in the scratch copy.
- Check that the call shape survives bundling: grep the compiled handler in `.next/server/app/<route>/route.js` (`await (0,c.X)()`) and in `apps/api/dist/server.js`.

Related: [[guard-matrix-parity-mutants]], [[server-action-caller-class-differential]], [[shared-worktree-git-archive-copy]]
