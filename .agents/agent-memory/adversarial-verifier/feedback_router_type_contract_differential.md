---
name: router-type-contract-differential
description: Prove a refactor kept every procedure's input/output type by printing inferRouterInputs/Outputs with the TS compiler API in base and head worktrees and diffing
metadata:
  type: feedback
---

To check "response shape unchanged" for a router refactor, don't eyeball the services: print the inferred types. Put a probe file in `packages/server/src/__probe.ts` of a base and a head scratch worktree (`type O = inferRouterOutputs<AppRouter>["<router>"]`, same for inputs), load it with `ts.createProgram` from the worktree's `node_modules/typescript` and the root tsconfig, and expand each type recursively to a sorted string. Then diff the two files.

**Why:** `typeToString` alone prints aliases, so two different types can print the same. A plain recursive printer turns string literal unions into `String` method lists unless you print `Primitive | Literal` flags first. Without that fix the diff comes out "IDENTICAL" but checks nothing about enums.

**How to apply:** check the printer's output for `__@iterator` (a broken literal) before you trust the diff. Pair it with the runtime error-shape differential in [[inline-to-runtrpc-error-differential]] and the middleware-per-export grep. See [[base-vs-head-procedure-differential]].

**Probe pitfalls (seen in the storage-effect step 5 PR B pass):**
- Find the probe's aliases with `checker.getExportsOfModule(checker.getSymbolAtLocation(sf))`; `getSymbolsInScope(sf, TypeAlias)` returns nothing for module exports and the dump comes out empty (0 lines, no error).
- Base and head live in different worktree paths, and expanded drizzle types print as `import("<abs path>")`: `sed` the worktree prefix to `<WT>` on both dumps before diffing, or three unrelated procedures show a false diff.
- Types declared in lib files (`Omit`, `Date`) print by name only; a second view with `typeToString(NoTruncation|InTypeAlias)` on the procedures under charter makes the check two-sided. Run one input mutant (`z.string()` to `.optional()`) to prove the dump sees a change.
- Whole-router dump (all procedures, not only the chart's four) shows exactly which keys left the surface: here the diff was only the removed procedures.
