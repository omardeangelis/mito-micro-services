---
name: runtime-topology-claims
description: How to check a "route X runs in process Y with bucket Z" claim - enumerate env flag combos, test each for coherence (session store, DB), probe transformer per link
metadata:
  type: feedback
---

A doc that says "on staging route X is served by Next.js/backend" is a claim about platform env that the repo usually does not hold (Vercel project variables). Check it this way:

- Read every flag that gates a rewrite (BACKEND_URL, BACKEND_AUTH, BACKEND_REST...) in the config and its test, not just the one the doc names. A doc that lists the rewrites of one flag as if they were another's is CONTRADICTED by the config test.
- Build the matrix of flag combos x process (Vercel, Cloud Run, backend direct) x env the deploy script sets (bucket var, DB). Then test each combo for coherence: a route handler on Vercel reads the session and DB of Vercel, so with the backend on its own DB (Cloud SQL) and auth rewritten, a Vercel-served route gets 401 and DB-writing routes split-brain. Often only one combo works: that is the topology the gate must assume, or verify first.
- Per combo, find which scheduler cleans the bucket the route writes (cron path rewritten or not, schedule commented out, lifecycle only on one bucket). A fix that makes a broken path work can start filling a bucket nobody cleans.
- Serializer breakage claims: tRPC v10 applies the transformer only in HTTP links (httpUtils, transformResult), never in a custom in-process link. Probe both with a tiny router + fetchRequestHandler as the link's fetch, from the repo's node_modules (createRequire). Also check the error/404 Response branches: a Response through superjson becomes {} and the route rebuilds a 200.

**Why:** in the chat-storage-effect PR B review the notes "corrected" a gate to the wrong topology by omitting BACKEND_REST; only the coherence test (Cloud SQL backend + Vercel sessions) showed which combo staging can actually run.

**How to apply:** any review whose charter asks where code runs per environment, or a release gate that says "check which bucket/DB it lands in". Related: [[review-at-reviewed-commit]], [[stale-text-after-ledger-change]].
