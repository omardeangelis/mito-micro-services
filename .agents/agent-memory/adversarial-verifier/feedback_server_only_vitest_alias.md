---
name: server-only-vitest-alias
description: vitest aliases server-only to an empty stub, so a green test run cannot prove a client-safe module avoids server code; probe with a real tsx import plus a control
metadata:
  type: feedback
---

`vitest.config.ts` aliases `server-only` to `node_modules/server-only/empty.js`. Every test therefore passes even if a client-safe module imports a `server-only` file. A green vitest run is no evidence for the "client modules must not reach server code" rule.

Check it at runtime instead: from the clean copy, run `pnpm exec tsx probe.ts`, where `probe.ts` imports the client-safe modules by their `@/` paths. tsx resolves the real `server-only` package, whose default index throws. Confirm the probe is sensitive with a control that imports a known `server-only` module (for example `@/server/services/contact/customerAlerts`): it must exit 1 with the throw. A probe that cannot fail proves nothing.

**Why:** In the PR5a run the tests passed while the client-safe modules were only checked statically. A real-runtime probe with a control is what made the claim evidence-based.

**How to apply:** Any time a charter asks whether a module is client-safe or server-only-free, use the tsx probe plus control. Keep the probe file in the clean copy, never in the repo.

**Second proof that needs no tsx:** bundle the entry with esbuild (`platform: "browser"`, `metafile: true`, `alias: {"@": "src"}`; esbuild sits in `node_modules/.pnpm/node_modules/esbuild/lib/main.js`) and list `metafile.inputs`: the client-safe modules gave only 4 src files plus `zod`; the control (`customerAlerts.ts`) gave 108 inputs with `drizzle-orm` and `server-only`. **Trap:** a hand-written import-closure script must skip `import type ...` lines, or `status.ts`'s type import of `@/lib/types/schemas` walks into `src/server/db/schema` and reports a false server leak. Check `tsconfig` has no `verbatimModuleSyntax` before trusting that `import { type X }` is erased. A module no page imports yet is not in the Next build output, so a green `next build` proves nothing about it.
