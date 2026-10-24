---
name: router-type-contract-differential
description: Prove a refactor kept every procedure's input/output type by printing inferRouterInputs/Outputs with the TS compiler API in base and head worktrees and diffing
metadata:
  type: feedback
---

To check "response shape unchanged" for a router refactor, don't eyeball the services: print the inferred types. Put a probe file in `packages/server/src/__probe.ts` of a base and a head scratch worktree (`type O = inferRouterOutputs<AppRouter>["<router>"]`, same for inputs), load it with `ts.createProgram` from the worktree's `node_modules/typescript` and the root tsconfig, and expand each type recursively to a sorted string. Then diff the two files.

**Why:** `typeToString` alone prints aliases, so two different types can print the same. A plain recursive printer turns string literal unions into `String` method lists unless you print `Primitive | Literal` flags first. Without that fix the diff comes out "IDENTICAL" but checks nothing about enums.

**How to apply:** check the printer's output for `__@iterator` (a broken literal) before you trust the diff. Pair it with the runtime error-shape differential in [[inline-to-runtrpc-error-differential]] and the middleware-per-export grep. See [[base-vs-head-procedure-differential]].
