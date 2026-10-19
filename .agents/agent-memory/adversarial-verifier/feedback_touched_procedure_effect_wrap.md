---
name: touched-procedure-effect-wrap
description: When a PR moves a query out of an existing tRPC procedure, check the procedure still wraps the Drizzle call in query and runTrpc; a plain builder return escapes the typed-error rule
metadata:
  type: feedback
---

When a diff extracts the body of an existing procedure into a shared helper, read the procedure's new body. A procedure that returns the Drizzle builder directly (`.query(({ ctx, input }) => helper(ctx.db, input.id))`) skips `query` (driver errors are not mapped to `DbError`) and `runTrpc` (no single edge). Judge it against the project's Effect rule and the plan's binding rule for the touched code. Confirm whether the plan names an exception for that procedure. Only the procedure the plan exempts is an exception.

Behaviour is usually unchanged here, so the finding is a convention breach, not a regression. Say so explicitly, and give the fix as the wrapper call, with the existing characterization tests named as the evidence that behaviour holds.

**Why:** In the PR5a run, `getCustomerAlerts` was refactored onto a shared builder, the plan's D9 covered PR5 queries and exempted only the preference procedure, and the procedure was left unwrapped. The shared helper was correctly wrapped at its Effect call site, which hid the gap.

**How to apply:** For each touched procedure, grep its new body for a direct `ctx.db` call or a builder return, and check whether it goes through `query` and `runTrpc`. Compare with the plan's exemption list before deciding severity.

**Verifying a fix of this finding (PR5a v10 re-check):** (1) `toSQL()` of the old inline builder vs the shared helper: drizzle's `and(x, undefined)` returns `x` unwrapped, so the default path is byte-identical (the `onlyClosed` path gets parentheses). (2) Put the ORIGINAL body in a scratch router (`createTRPCRouter({ task: createTRPCRouter({ p: oldProc }) })`) and call both routers through `fetchRequestHandler` with `createContext: () => createTRPCContext(...)`: compare happy-path rows (include tied sort keys, JSON.stringify for order) and the error-path HTTP body after renaming the table. Result there: bodies identical; only difference is one extra `console.error` from `runTrpc`. (3) Revert-the-wrap mutant (`customerAlerts(ctx.db, ...)`) leaves the full suite green: nothing but the code pins the wrapper, so report the missing pin as a NIT, not a blocker. Count rows by hand before asserting a length in a probe (my first probe failed on my own off-by-one, not on the code).
