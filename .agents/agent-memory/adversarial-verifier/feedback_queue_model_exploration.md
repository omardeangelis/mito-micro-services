---
name: queue-model-exploration
description: Plans with pure reducers over a local queue - code the rules literally in a small model and explore random event orders; probe effect writes against async writes
metadata:
  type: feedback
---

For a plan that describes pure functions plus one reconciling effect, reasoning alone keeps missing transitions:

- **Literal model.** Write the rules as stated, with a fake server and reads that can be served, landed or failed, then run 400k random orders and check invariants at rest after a final re-read. Add a negative control (drop the guard, expect a violation), or a clean run proves nothing.
- **The real server's answer to the second press.** Read its order of checks: a "resumes when the send ends" rule can be dead because the only possible answer takes another exit that clears the state it needs.
- **Absolute write in an effect.** `setQueue(next)` computed from a closure drops a functional update queued between commit and passive flush. Probe: microtask from `useLayoutEffect` queues the update, compare absolute and functional forms.

**Why:** home-operatore plan gate round 4 (2026-11-05): tick and query-core ordering held; the defects were a cleared list on the rejection path and an unspecified write form.
**How to apply:** any `reconcile`-style plan. Related: [[terminal-state-and-gate-coupling]].
