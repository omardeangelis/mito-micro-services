---
name: server-action-boundary-checks
description: How to check a "use server" action boundary fast - run the real zod schema with tsx, read revalidatePath source, compare with /api/trpc exposure
metadata:
  type: feedback
---

To test the real drizzle-zod/zod schema of an action against hostile input, run a probe script from the scratchpad with
`NODE_PATH=$PWD/node_modules SKIP_ENV_VALIDATION=true node_modules/.bin/tsx --tsconfig tsconfig.json <scratch>/probe.ts`
(without NODE_PATH, `zod` does not resolve from the scratchpad). `JSON.stringify` prints Infinity as null: do not misread it as coercion.

**Why:** reasoning about `.pick().merge()` order and drizzle-zod output (no `.int()`/`.finite()` in 0.5.x) is error-prone; a 10-line probe settles it.

**How to apply:**
- Compare the action schema with the tRPC procedure's input schema: if the action is equal or stricter, nothing new reaches Drizzle.
- "Widening" question: if the procedures are also reachable over `/api/trpc` with the same session, a server action calling them adds no capability; only check that every write runs after an authenticated call.
- Next 14.2 `revalidatePath` does no normalization or I/O: it pushes a literal tag `_N_T_<path>/<type>`. A hostile segment cannot escape the fixed prefix; at most it invalidates tags under it (e.g. `[id]`). Treat as NIT unless the data cache is used for sensitive fetches.
- Check whether tests mock the action module: then the action's return contract is covered only by tsc.
