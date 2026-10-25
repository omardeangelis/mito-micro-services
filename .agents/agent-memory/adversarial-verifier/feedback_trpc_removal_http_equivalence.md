---
name: trpc-removal-http-equivalence
description: When a route stops calling an in-process tRPC procedure, probe base vs head for import-time crashes hidden by setup mocks, defect-path telemetry (loggerLink, trpcMiddleware) and byte-copy mutants the memory storage layer cannot kill
metadata:
  type: feedback
---

Lessons from an HTTP equivalence pass on routes that dropped `api.<router>.<proc>.mutate` for a direct Effect service call.

1. **A base "404" in vitest can be a mock artifact.** `src/test/setup.ts` mocked a module that, in production, ran `createClient(env!)` at import. With a broken env the base route module did not load at all (every request 500), so the declared "404 becomes 500" regression only exists on the other storage branch. Probe it: `vi.doUnmock(<module>)`, `vi.stubEnv(...)`, then `await import(route)` inside the test, in base and head. Vitest also sets `SKIP_ENV_VALIDATION=true` and mocks `@mito/server/auth`: in a real runtime `@mito/env` (t3-env, `emptyStringAsUndefined`) throws on an empty env first, in base and head alike, so a "now the route loads with an empty env" claim is test-only. Probe `import(packages/env/src/index.js)` under `env -i` with placeholders.
2. **Defect-path telemetry changes with tRPC removal.** In-process tRPC adds a `loggerLink` console.error line (with the input; in Node, ansi mode, a Buffer prints as `<Buffer xx ... N more bytes>`, 50 bytes, not the whole file: only jsdom/browser use css mode) and a `Sentry.trpcMiddleware` event; the thrown object becomes `FiberFailure` instead of `TRPCClientError`. To record it, `vi.mock("@sentry/nextjs")` keeping the real module and wrapping `trpcMiddleware` (`const mw = real.trpcMiddleware(o); return async a => { const r = await mw(a); if (!r.ok) record(r.error); return r }`). Next 14 answers an uncaught route error with `Log.error` + `new Response(null, {status: 500})` (base-server.js), and Sentry's route wrapper captures it.
3. **The memory storage layer cannot kill a missing download copy.** Its `download` returns `body.slice()`, a fresh exact buffer for a Uint8Array and an exact view for `Buffer.from(ArrayBuffer)`, so `new Response(result.right.buffer)` survives every memory-layer test. Kill it with a layer whose download returns `new Uint8Array(ab, 7, 5)` or `Buffer.concat([small])` (offset 16, 8 KB pool: the mutant leaks other memory). GCS `file.download()` uses `Buffer.concat`, so files under 4 KB are pooled.
4. **`Buffer.prototype.slice` is a view.** The memory layer's "copy the bytes" `.slice()` aliases the caller's Buffer: once a caller passes a Buffer instead of a `new Uint8Array(...)` copy, the stored object changes with it.
5. For wire-byte equivalence of a real SDK, point it at a local `node:http` fake server (in a worktree with no `.env*`) and compare sha256 and headers of the requests in base and head.

Related: [[mocked-framework-side-effects]], [[inline-to-runtrpc-error-differential]], [[server-only-vitest-alias]].
