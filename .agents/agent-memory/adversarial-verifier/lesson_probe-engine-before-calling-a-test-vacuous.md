---
name: probe-engine-before-calling-a-test-vacuous
description: When a plan's test recipe looks vacuous (tie-break, ordering, CTE), run a 20-line probe on the real engine before raising it; my first suspicion was wrong once
metadata:
  type: feedback
---

Reasoning about whether a planned test can fail ("ids in the order opposite to insertion, so a missing ORDER BY tiebreak is not caught") is unreliable. PGlite is importable from the repo's `node_modules` by absolute path (`.../node_modules/@electric-sql/pglite/dist/index.js`) from a scratch `.mjs` in the scratchpad, so the claim can be settled in seconds.

**Why:** in the contacts-section PLAN review (T6.1) I suspected the "reverse ids" recipe made the pagination test pass without the tiebreak. The probe showed LIMIT/OFFSET with equal keys comes back scrambled (top-N heapsort) in BOTH id configurations, so the test is not vacuous. Raising it would have been a false positive.

**How to apply:** for any "this assertion is green on today's code" or "this SQL does X" claim, write the minimal table + query in PGlite and print the result; also use it to confirm single-statement CTEs (`WITH moved AS (...), upd AS (UPDATE ... RETURNING) INSERT ... SELECT FROM moved`) behave as a plan says. Keep scratch files in the scratchpad, never in the repo.
