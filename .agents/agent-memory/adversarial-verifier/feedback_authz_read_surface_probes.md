---
name: authz-read-surface-probes
description: How to check auth gates, actor injection and client-visible error payloads of tRPC reads fast - HTTP handler probe, PGlite table rename for DbError, tsc mutant for gate downgrade
metadata:
  type: feedback
---

For an authz/exposure charter on tRPC procedures, three probes settle most questions in one scratch `*.db.test.ts`:

- **Gates:** `appRouter.createCaller({ db: testDb, session: null | {user:{id}} ... })` for no session (UNAUTHORIZED), a `createUser()` without operator row, and `"system"` with `createSystemOperator()` (both BAD_REQUEST).
- **Actor injection:** pass `actor`/`operatorId` extra keys `as never`; zod `z.object` strips them, but prove it on the result (onlyMe total, editability).
- **What the client really gets:** import `GET` from `@/app/api/trpc/[trpc]/route`, set `vi.mocked(getServerAuthSession).mockResolvedValue(session)`, request `?input=` + `JSON.stringify({ json: input })`, parse and delete `data.stack` (dev only). Force a DbError with `testClient.exec('ALTER TABLE "mito-deutsche_x" RENAME TO ...')` and rename back. A route that uses `api` from `@/trpc/server` needs `vi.mock("next/headers")` and `react` `cache` identity.

**Why:** reasoning about errorFormatter + runTrpc + superjson is error-prone; the HTTP body is the ground truth (here: PG message only, `contactError` payload `{}`).

**How to apply:** before asking for a runtime gate test, try a tsc mutant (operatorProcedure -> protectedProcedure): a procedure that reads `ctx.operator` is type-pinned, so the missing test is a NIT, not a MAJOR. A procedure that never reads `ctx.operator` is not pinned. postgres-js puts `query`/`parameters` on errors as non-enumerable unless `debug`, so logs/payloads don't carry params.

**Route handlers that wrap a procedure:** a Next route that calls `api.x.mutate(body)` without a try/catch (here `/api/user/preferences`) lets the `TRPCClientError` escape, so a zod limit that gives BAD_REQUEST through `createCaller` is an HTTP 500 at the route the client really calls. Probe the route itself (`POST(new NextRequest(url, { method, body }))`, with the `next/headers` and `react` `cache` mocks) before saying "rejected with 400".

Related: [[real-caller-probe-and-kill-reason]], [[server-action-boundary-checks]], [[mutant-battery-scratch-copy]]
