---
name: base-vs-head-procedure-differential
description: How to prove a "behavior unchanged" refactor of a tRPC procedure: run base and head side by side on one PGlite seed, recording SQL text and params
metadata:
  type: feedback
---

For a "same behavior" refactor (for example moving a procedure to Effect), a characterization suite only covers its own inputs. A stronger check is a seeded fuzz differential in a scratch worktree:
- Copy the base file next to the head one (`GET/base.ts`, so the relative imports still resolve), then call it through `createTRPCRouter({ g: base.proc }).createCaller(ctx)`, using the same ctx as `createTestCaller`.
- Watch the session id: `createTestCaller` takes `actor.userId` before `actor.id`. An operator's `id` is numeric, so passing `actor.id` to the base ctx gives a false BAD_REQUEST divergence.
- Record SQL by patching `testClient.query` (the PGlite instance in `@/test/db`). Compare the sorted statement lists on success, because Effect.all runs the queries concurrently.
- On errors, compare code and message only. With concurrent `Effect.all`, head also runs the sibling query after the first one fails, where the base stopped. That costs DB work and is not a behavior change. Count these cases and report them as a NIT.

**Why:** In the AC12 pass on getAllPratiche, 600 fuzz cases matched exactly. That is direct evidence of equivalence, which the characterization tests alone don't give.

**How to apply:** In any AC that says "same data, total and order as before", run this differential. Don't rely on the test file alone.

Under full-suite load, the seed perf tests (`generate`, `contacts` at N=10,000) and `auth.test.ts` time out. Rerun them in isolation before calling them a regression.
