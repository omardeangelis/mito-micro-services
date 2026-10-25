---
name: real-handler-client-probe
description: End-to-end error-contract probe using the real appRouter behind createTRPCProxyClient with fetchRequestHandler as the link's fetch, plus inProcessLink; no server needed
metadata:
  type: feedback
---

To prove a procedure error reaches `readContactError`/`describeContactError` in both shapes, do not rebuild the shape by hand: in an out-of-tree vitest (see [[out-of-tree-vitest-probe]]) build `createTRPCProxyClient<AppRouter>` with `httpBatchLink({ url, fetch: (i, init) => fetchRequestHandler({ endpoint: "/api/trpc", req: new Request(i, init), router: appRouter, createContext }) })` for HTTP and `inProcessLink(ctx)` from `@/trpc/inProcessLink` for in-process. Context = `{ db, supabaseClient: {}, session: { user: { id: operator.userId } }, headers }`.

**Why:** a first run failed with a plain `BAD_REQUEST` and null contactError that was not the thing under test: `operatorProcedure` rejected because I passed `operator.id`, not `operator.userId` (`createTestCaller` hides this). Read `err.data.code` and the stack before trusting a negative.

**How to apply:** also mutate (drop cause, wrong code, delegate back to the old translator) and run the repo tests; add a new tag to the union to confirm tsc exhaustiveness (missing case gives TS2366 and the test's `Record<Tag,...>` fails). A mutant made with `sed` on a line containing `(` / `"` may silently not apply: check `git diff --stat` printed 1 change before reading green.
