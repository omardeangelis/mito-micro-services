---
name: client-graph-esbuild-probe
description: Prove no server-only module or server env reaches the client bundle by bundling each "use client" file with esbuild from the pnpm store, stopping at "use server" files
metadata:
  type: feedback
---

Grepping imports misses transitive reach. A script in the scratchpad bundles every changed `"use client"` file with `node_modules/.pnpm/node_modules/esbuild` (`bundle`, `metafile`, `platform: browser`, `tsconfig` for the `@/` alias), marks bare packages external, and lists any reached input under `src/server/`, `src/trpc/server`, `src/env.js`, any `process.env.X` that is not `NEXT_PUBLIC_`/`NODE_ENV`, or an external import of `server-only`, `next/headers`, `drizzle-orm`.

Pitfalls: (1) a `"use server"` module must be a boundary (resolve the path yourself in `onResolve` and mark it external), or a client file that imports a server action looks like it pulls the whole router. (2) esbuild drops `import type`, which matches Next. (3) zsh does not split a variable holding the file list: pass `${(f)"$(cat files.txt)"}`. (4) `src/trpc/shared.ts` reads `VERCEL_URL`/`PORT` behind `typeof window`: a pre-existing, expected hit for every `@/trpc/react` consumer.

**Why:** the vitest alias stubs `server-only` ([[feedback_server_only_vitest_alias]]), so tests cannot show client reachability, and `next build` is off limits in review.

**How to apply:** run it on the client files of the change set; report only new hits.
