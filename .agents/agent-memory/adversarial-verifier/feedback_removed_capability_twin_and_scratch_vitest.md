---
name: removed-capability-twin-and-scratch-vitest
description: When a change "removes a capability" (e.g. bulk reassignment), grep every writer of the column across routers; scratch vitest probe outside the repo needs absolute imports
metadata:
  type: feedback
---

A removal of one procedure rarely removes the capability. Grep every `.update(<table>)` that sets the column (`git grep -n "update(practices)"`), including other routers (`import`) and REST routes; a twin can be weaker (protectedProcedure) and still mounted. Prove reachability with a caller probe (user with no operator row, target disabled).

**Why:** pratiche-effect TD9 (k) removed `bulkAssignPractices` while `import.updateExistingPractices` (protectedProcedure, operatorId from input) still bulk-reassigned; the new debt text claimed the opposite.

**How to apply:** scratch probe = test file + `vitest.probe.config.ts` in the scratchpad that `mergeConfig`s the repo config with `root` = repo, `include` = absolute probe path, `server.fs.allow`. Bare imports (`vitest`, `drizzle-orm`, `@mito/*`) fail from outside the repo: import them by absolute path (`<repo>/node_modules/vitest/dist/index.js`, `<repo>/packages/db/src/schema/x.ts`); `@/` aliases work. `rejectionOf` throws "the call did not fail" on success. See [[feedback_api_surface_caller_and_gate_reconcile]].
