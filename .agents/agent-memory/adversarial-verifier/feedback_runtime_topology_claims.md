---
name: runtime-topology-claims
description: How to check a "route X runs in process Y with bucket Z" claim and the gate built on it - flag combos, coherence (session DB), transformer per link, session check before superjson, the gate's failure branch (build-time flags, coupled flags, cleanup)
metadata:
  type: feedback
---

A doc that says "on staging route X is served by Next.js/backend" is a claim about platform env that the repo usually does not hold (Vercel project variables). Check it this way:

- Read every flag that gates a rewrite (BACKEND_URL, BACKEND_AUTH, BACKEND_REST...) in the config and its test, not just the one the doc names. A doc that lists the rewrites of one flag as if they were another's is CONTRADICTED by the config test.
- Build the matrix of flag combos x process (Vercel, Cloud Run, backend direct) x env the deploy script sets (bucket var, DB). Then test each combo for coherence: a route handler on Vercel reads the session and DB of Vercel, so with the backend on its own DB (Cloud SQL) and auth rewritten, a Vercel-served route gets 401 and DB-writing routes split-brain. Often only one combo works: that is the topology the gate must assume, or verify first.
- Per combo, find which scheduler cleans the bucket the route writes (cron path rewritten or not, schedule commented out, lifecycle only on one bucket). A fix that makes a broken path work can start filling a bucket nobody cleans.
- Serializer breakage claims: tRPC v10 applies the transformer only in HTTP links (httpUtils, transformResult), never in a custom in-process link. Probe both with a tiny router + fetchRequestHandler as the link's fetch, from the repo's node_modules (createRequire). Also check the error/404 Response branches: a Response through superjson becomes {} and the route rebuilds a 200. Run the probe twice, with the backend accepting and rejecting the session: input deserialization fails before any middleware (so an upload breaks either way), but an output-shape claim ("404 arrives as 200 empty") needs the procedure to run, and with a split session DB it answers UNAUTHORIZED instead (route throws, Next 500). `new Response({})` has body "[object Object]", not empty.
- Then attack the gate's failure branch, not only its happy path: (1) rewrites fixed at build mean "read the project variables" does not tell what the serving deployment runs, and "turn on flag X" needs a redeploy; (2) the observed failure often implies another flag's state too (a file written by a Vercel-served route means the login was on Vercel, so the fix needs the auth flag as well); (3) data the failed check wrote (personal data in an uncleaned bucket) needs a cleanup step; (4) can the gate stop before the write, given its own first step already reveals the bad config.

**Why:** chat-storage-effect PR B: round 1 the notes omitted BACKEND_REST; round 2 the rewritten gate was right on the topology but its remedy flipped one of three flags, with no redeploy and no cleanup of the leaked file.

**How to apply:** any review whose charter asks where code runs per environment, or a release gate that says "check which bucket/DB it lands in". Related: [[review-at-reviewed-commit]], [[stale-text-after-ledger-change]], [[release-runbook-as-procedure]].
