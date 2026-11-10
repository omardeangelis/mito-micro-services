---
name: plan-shared-query-retry-and-table-probes
description: Plan checks for parts on a shared query - where the "retrying" flag lives, new-observer refetch, table truncation and scroll-anchoring probes
metadata:
  type: feedback
---

When a plan says "skeleton after Retry" on TanStack Query 5, ask who owns the retrying flag: `refetch` leaves status `error` with data (fetchState resets only without data), so a flag local to one component misses sibling cells and other parts reading the same query; `resetQueries` needs no flag.

**Why:** the plan's pure `partState` looked complete but had no input for it, and another part's disabled rule depended on it.

**How to apply:** grep every consumer of the query in the ACs. With staleTime 0 any observer mounted later refetches. `truncate` in an auto-layout table does not truncate (probe: table grew to 2727 px, `table-fixed` 992). Scroll anchoring probe must REUSE DOM nodes: rebuilding them disables anchoring and hides its effect; a forced read in layout effect sees the anchored position, so no double compensation in Chromium. Check that fixtures of a browser-only AC exist in the seed, or the T-browser row is vacuous.
