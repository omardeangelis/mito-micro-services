---
name: client-queue-probe-traps
description: Client state machine on TanStack Query - sticky flags that gate notices, gcTime 0 kept across a same-commit route swap, retryDelay 0 in renderWithApi hiding retry windows, NOOP mutant first
metadata:
  type: feedback
---

- **Sticky gate flag.** A list that empties only on one terminal state (uncertain ids on a row) gating a notice stays set for the whole visit: probe the "not written" and "written but not closing" cases, then a real colleague answer.
- **`gcTime: 0` is not "no cache" on a same-commit swap.** Two routes rendering the same view unmount and mount the observer in one commit, so the query survives and the new visit loads stale rows, with no skeleton. Probe with `router.navigate` between the two addresses and a held read.
- **`renderWithApi` sets `retryDelay: 0`**, so a failing read looks instant: a probe of "what shows during the update" must `hold` the read after `recover`, or the 7 s window is invisible (first probe wrongly showed no skeleton, and a toast "at once").
- **Parent that gates on a store set in an effect** (`role === undefined && !isError` returns null): when `/me` recovers there is one commit with neither, and the view unmounts. Needs the real provider in the probe.
- **Add a NOOP mutant to every battery.** A python subprocess ran x64 node: 30 of 30 "killed" with zero FAIL lines. Use `arch -arm64` and read the kill names.

**Why:** home-operatore client state machine pass, 2026-11-05: reducers held under a 300k random model, every defect was at the edges of them.
**How to apply:** after the pure model is clean, probe the edges: notices, parents of the hook, the options of the queries. Related: [[queue-model-exploration]], [[terminal-state-and-gate-coupling]].
