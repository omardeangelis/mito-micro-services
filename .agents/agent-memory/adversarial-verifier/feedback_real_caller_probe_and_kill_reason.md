---
name: real-caller-probe-and-kill-reason
description: Check error-shape claims through the real in-process tRPC proxy (src/trpc/server.ts api) with session/headers/react-cache stubbed; and read the kill reason of a removed-wrapper mutant
metadata:
  type: feedback
---

To verify a server action that catches a tRPC error by shape, do not trust a unit test that builds the error by hand. Import the real `api` from `@/trpc/server` in a `*.db.test.ts` in a scratch copy, stub `next/headers` (`headers: () => new Headers()`), `react` `cache` (identity, React 18.3 has none), `next/cache`, and set the session via the setup mock of `@/server/auth` (`getServerAuthSession`). Then the NOT_FOUND, FORBIDDEN and INTERNAL paths can each be checked end to end. Here the real shape was `TRPCClientError` with `cause` an `instanceof TRPCError`, `cause.code` set, and `data` undefined.

**Why:** the action test mocked `@/trpc/server` and built the same shape by hand, so only the probe showed the real caller produces it.

**How to apply:** when a mutant removes a wrapper (`transaction`, `lockCustomer`), check the log for the failure reason. A wrapper removal can fail for an unrelated reason (here `lockCustomer` requires the `Tx` service, so the mutant died without testing rollback). Supply the service the wrapper provided (a `Tx` with a non-transactional client) to get a real kill or a real survivor. A rollback guarantee needs a failure-injection test (`failNextUpdateOf` on the last write), and that is what to ask for when the suite lacks one.

Related: [[feedback_server_action_boundary_checks]], [[feedback_lock_order_mutants]], [[feedback_mutant_harness_hygiene]]
