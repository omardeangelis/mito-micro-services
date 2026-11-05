---
name: terminal-state-and-gate-coupling
description: Local-queue designs with a pending/uncertain row - check whether a fallback closure is terminal, whether settling is edge-triggered on new data, and whether a two-query idle gate couples independent parts
metadata:
  type: feedback
---

For a client state machine fed by several reads (rows plus diary):

- **Fallback closure is terminal?** Put the two reads on either side of the server commit, and press partial retries in both orders. A generic closure can block the exact one that arrives later.
- **Edge trigger.** A "process only new data" ref skips data read before the row entered the state that needs it. Then fail the refresh.
- **Guards on every path.** A rule like "no closure during a send" may be enforced by one function only: list every function that closes a row.
- **Idle gates.** Waiting for two queries couples them: test a hung read, not only a slow one, when reads have no timeout.

**Why:** home-operatore plan gate round 3 (2026-11-05): query-core mechanics held, the defects were all in these state transitions.
**How to apply:** any plan with `reconcile`-style pure functions over a local copy. Related: [[retry-timeout-and-global-toast-checks]], [[created-first-order-and-uncertain-reread]].
