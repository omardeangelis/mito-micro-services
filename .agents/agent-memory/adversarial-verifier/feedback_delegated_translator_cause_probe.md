---
name: delegated-translator-cause-probe
description: Probe every tag a new error translator delegates to an old one for a contact cause; scratchpad tsx recipe for HTTP and in-process shapes
metadata:
  type: feedback
---

When a new `*ErrorToTrpc` delegates a tag to `contactErrorToTrpc` (default branch), check that the delegated TRPCError carries a `contactErrorCause`. `CustomerMissing` does not: it is a plain BAD_REQUEST with the text only in `message`, so `readContactError` gives null and `describeContactError` shows the generic "Modifica non salvata, riprova" in both shapes.

**Why:** a 2026-10 review of pratiche-effect (TD9 m, "right message in the form") passed router tests that pinned only `code` and `message`; the action reads the cause, never the message, so the pinned message never reaches the user.

**How to apply:** run every tag through translator -> `getErrorShape` -> superjson round trip -> `TRPCClientError.from({error})` (HTTP) and `TRPCClientError.from(trpcError)` (in-process) -> `readContactError` + `describeContactError`. Recipe that works from the scratchpad: tsx script with absolute imports (`<repo>/node_modules/superjson`, `@trpc/client`, `@trpc/server`), a minimal `initTRPC.create({transformer: superjson, errorFormatter})` copying the formatter (importing `api/root` fails on `@auth/drizzle-adapter` exports), and `NODE_OPTIONS="--require stub.cjs"` where stub overrides `Module._load` for `server-only`. Run with `SKIP_ENV_VALIDATION=true NODE_ENV=test`. `timeout` does not exist on macOS.

Related: [[action-error-shape-probes]]
