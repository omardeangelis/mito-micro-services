---
name: action-error-shape-probes
description: How to check a server action's { error: code } contract in both @/trpc/server link modes; fixture traps that let mutants survive
metadata:
  type: feedback
---

Server-action error contracts must be probed in both link modes, not only via the unit test's hand-built error.

**Why:** an action test whose fixture is `new TRPCClientError(code, { cause: TRPCError })` only covers the in-process shape, and its message equals the code. In a 2026-10 review, a mutant reading `e.message` and a mutant reading only `cause.cause.code` both survived the action tests. The cause-only mutant returned UNKNOWN for every code over BACKEND_URL.

**How to apply:**
- Probe: put a temporary `*.db.test.ts` next to the action. `vi.mock("@/trpc/server")` with `mutate` that forwards to a mutable `h.api`. Build `h.api` once with the real `backendLink` against `serve({ fetch: app.fetch })` (apps/api/src/app, session row + `__Secure-next-auth.session-token` cookie, `vi.unmock("@mito/server/auth")`), and once with the real `inProcessLink` and a hand-made ctx. Delete the file after the run.
- False divergence: a disabled actor gives OPERATOR_DISABLED in-process with a hand-made session but UNKNOWN over HTTP. The real NextAuth adapter returns null for disabled users in both modes, so this is a probe artifact, not a mode bug.
- Mutants to run: rethrow, revalidate-before-call, wrong path, read message instead of code, cause-only reader, and the UNKNOWN literal on each action.

**Later pass (v7):** the fixed tests killed the message, cause-only, data-only and UNKNOWN-literal mutants, but a mutant `?? e.data?.code ?? "UNKNOWN"` survived on both actions: the BACKEND_URL fixture always carries `contactError`, so no test has an HTTP-shaped tRPC error with `contactError: null` (the real formatter output for a plain FORBIDDEN). Always add that fixture to the mutant list. A procedure-always-rejects mutant survives a "caller is OPERATORE -> UNKNOWN" db test when there is no ADMIN success case on the same procedure: UNKNOWN is reachable by any failure; look for the paired ADMIN case.

Related: [[mutant-battery-scratch-copy]], [[real-caller-probe-and-kill-reason]]
