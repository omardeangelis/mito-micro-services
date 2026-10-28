---
name: error-class-edge-differential
description: How to prove an error-class switch (Data.TaggedError -> Schema.TaggedError) leaves tRPC/HTTP/Sentry edges unchanged; tsx probe traps
metadata:
  type: feedback
---

To check that changing how error classes are built leaves the edges unchanged, run the same tsx probe in a scratch worktree of base and of head, then diff the JSON output by path. For each exported class (and each field variant: explicit undefined, absent key, Error cause), record: name, message, String(e), Object.keys, getOwnPropertyNames, the `{_tag, ...rest}` spread (translators build payloads with it), JSON.stringify, whether cause/nested objects keep the same reference, the first line of the stack, the first line of Cause.pretty. Then run every exported `*ErrorToTrpc`, build the HTTP shape (getErrorShape + superjson round trip + TRPCClientError.from) and the in-process shape, and call readContactError on both. Capture the Sentry event with a real `Sentry.init` whose beforeSend records the event and returns null.

**Why:** the review of the Effect 4 style PR (2026-10-28) found only reference-identity differences: a Schema Struct/Array field is a copy. Every outward byte matched. Without the reference-identity columns, the probe would have been blind to the one real change.

**How to apply:**
- Importing `@mito/server/api/root` under tsx fails (`Sentry.trpcMiddleware is not a function`). Copy the errorFormatter into `initTRPC.create(...)` instead. That is valid only if trpc.ts is not in the diff.
- Sentry events can land in the next capture's bucket with `flush(100)`, which shows up as false diffs. Use `flush(2000)` and rerun before reporting.
- Base and head both have Effect.fn, so wrapping a program in Effect.fn tests nothing. To see what a traced function changes, compare gen against fn inside one tree. In Effect 4.0.6 Sentry gets the same raw error and stack. Only Cause.pretty gains span lines.
- Running the whole suite while other verifiers use the same machine gives hook timeouts in `*.db.test.ts`. Rerun the failed files alone before calling them failures.

Related: [[three-transport-contract-differential]], [[inline-to-runtrpc-error-differential]]
