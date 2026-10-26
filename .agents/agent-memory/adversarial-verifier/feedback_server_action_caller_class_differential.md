---
name: server-action-caller-class-differential
description: To prove a server action that lost its own operator lookup rejects the same callers, run the real action through the real router per caller class in base and head copies (vitest shim + mocked getServerAuthSession)
metadata:
  type: feedback
---

When a server action drops calls (e.g. `getUserOperator` + `getUniqueChatOperator` + `addOperatorToChat`, replaced by one procedure that does it all), don't reason about who is rejected: run it.

- In vitest, `@/trpc/server` is aliased to `apps/api/src/shims/trpcServer.ts` (inProcessLink + `createTRPCContext`), and `src/test/setup.ts` mocks `@mito/server/auth` `getServerAuthSession` as a `vi.fn`. So `vi.mocked(getServerAuthSession).mockResolvedValue({ user: { id }, expires })` plus `vi.mock("next/cache")` runs the real action against the real router and testDb. No `@/trpc/server` mock needed.
- One probe file, copied into a `git archive <base>` copy and a `git archive HEAD` copy. Rows: no session, user without operator, `"system"` user id, disabled operator, active member, active non-member, admin non-member, orphan chat, missing id. Log outcome (resolved / rejected code+message) and DB state before/after per row, then diff the two runs.
- HTTP twin: import `GET`/`POST` from `@/app/api/trpc/[trpc]/route`, POST `{"json": {...extra keys}}` to show injected ids are ignored and removed procedures answer 404 `No "query"-procedure`.

**Why:** in the chat-storage-effect PR A pass, the table matched on 8 of 9 rows. The one difference (missing chat: FK 500 before, NOT_FOUND after) was a rejection both times, and the base run showed the removed `protectedProcedure` read was open to non-operators (200), so removing it only narrowed access.

**How to apply:** use this for any "the action no longer checks X itself" charter. Write mutants that really change behavior: `operatorId + 0 * 0` is an equivalent mutant, so it survives and proves nothing. Related: [[authz-read-surface-probes]], [[guard-matrix-parity-mutants]], [[shared-worktree-git-archive-copy]].
