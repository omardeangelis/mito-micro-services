---
name: inline-to-runtrpc-error-differential
description: How to check an inline Drizzle procedure moved to query + runTrpc; DbError mirrors `code`, so `cause: { code }` tests cannot tell the two causes apart
metadata:
  type: feedback
---

When a procedure moves from inline Drizzle to `query` + `runTrpc`, `cause: { code: "23505" }` style assertions pass on both sides: `DbError` copies `code` from the driver error. They prove nothing about the cause object. What really changes: `cause` becomes `DbError` (keys `_tag`, `code`), with the PostgresError one level below it, so `detail` and `constraint_name` go out of reach. On top of that comes one `Effect.logError` line for each failure.

**Why:** in the customer-effect review the HTTP bodies and the codes and messages came out identical, but only a differential probe showed the cause and log difference. The PLAN had accepted it, so it was a NIT, not a finding.

**How to apply:** put one probe `*.pg.test.ts` file in both a base worktree and a head worktree. For each error case it records ctor, code, message, the cause constructor and its keys, `cause.cause`, and the console output from spies. It also runs the HTTP path through `fetchRequestHandler` from `@trpc/server/adapters/fetch` (body `{json: input}`, delete `data.stack`). Then diff the two JSON files. To check the log for PII, grep the full log line for `Key (`/`detail`: `Cause.pretty` printed only the message and stack. See [[base-vs-head-procedure-differential]] and [[action-error-shape-probes]].
