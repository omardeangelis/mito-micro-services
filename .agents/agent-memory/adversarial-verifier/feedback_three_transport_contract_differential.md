---
name: three-transport-contract-differential
description: One case table run over createCaller, inProcessLink and HTTP in base and head worktrees, real server actions included; caller adapter pitfall, log content-marker grep, annotation-masked type mutant
metadata:
  type: feedback
---

For an "error contract unchanged" pass, run one table of cases (success, every tagged error, driver errors forced by failpoints or `ALTER TABLE ... RENAME`) through three transports in a base and a head `git worktree` (+ `pnpm install --frozen-lockfile --offline`): `createTestCaller`, a proxy client on `inProcessLink`, and a proxy client on `httpBatchLink` whose `fetch` is `fetchRequestHandler` with the backend's `onError`. Run the real server actions too: `vi.hoisted` holder plus `vi.mock("@/trpc/server", () => ({ get api() { return holder.api } }))`, then switch `holder.api` per transport. Record code, message, `data` without stack, the cause chain, the DB rows after the call and the console lines (spy on every console method). Diff with the cause fields stripped, and list the cause-only diffs on their own.

**Why:** the chat-storage review (2026-10-25) got 151 cases. It showed that only the declared changes differ, and that the DbError layer is the only extra in the cause chain. A `SEGRETO` marker in the note content, grepped across the log lines, proved the new `tRPC procedure failed` lines carry no note text.

**How to apply:**
- `createCaller` is called directly (`caller.chat.x(input)`). Calling `.query` or `.mutate` on it fails with `TypeError ... reading '_def'`, so wrap it in an adapter before you reuse the table.
- `resetDb` restarts identities, so ids match between the two sides. Only the nanoid customer ids need replacing.
- In the type differential (see [[router-type-contract-differential]]), an explicit return annotation on the service hides output mutants such as `inserted[0]!`. Mutate the annotation instead.

Related: [[real-handler-client-probe]], [[inline-to-runtrpc-error-differential]].
