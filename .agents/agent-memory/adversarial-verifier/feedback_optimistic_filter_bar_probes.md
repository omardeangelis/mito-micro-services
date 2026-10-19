---
name: optimistic-filter-bar-probes
description: How to break a URL-filter bar with optimistic local state - discarded navigations from sibling controls, RSC delay injection, guards that block the whole bar, sync router mocks that hide pending paths
metadata:
  type: feedback
---

A filter hook kept local state over the address and passed 99 tests; two real defects only showed with these checks:

- **Sibling navigators build from the address, the hook from its local state.** Sort headers, pagination, per-page and empty-state links that build hrefs from the address `state` discard a pending filter/search navigation (Next 14.2 `action-queue.js`: a new NAVIGATE marks the pending one `discarded`). Probe: change a filter or type a search, then click a sort header before the RSC lands. The click is lost, or (with a "keep the typed text while in flight" rule) the box shows text the list does not apply, and the next toggle silently applies it.
- **Open the pending window in the browser** by patching `window.fetch` in an `eval`: delay requests whose headers carry `RSC: 1` (`window.__delay = 3000`). Also wrap `history.pushState/replaceState` and watch `aria-busy` with a MutationObserver (plus a `.animate-pulse` count) to log push vs replace and the busy span. Changes only the session.
- **A "not applicable yet" guard can block the whole bar.** If `apply` refuses to navigate while one field is invalid, every other control flips on screen and never navigates. Chrome's date input turns a typed 2-digit year "26" into `0026-10-01`, a value the server refuses: real trigger, no message. Check what else each guard blocks, not only the field it guards.
- **Sync router mocks make `pending` flip true then false at once**, so effects keyed on `pending` (resets after a discarded or same-address navigation) never run in the hook test; their removal survives. Probe with a mocked navigation context whose `pending` the test holds open.

**Why:** the plan's browser log and the committed tests covered each control alone; the race and the guard only fail across controls.
**How to apply:** for any optimistic URL-state UI, list every navigator and what state it builds from, then run the cross-control probe with the RSC delay. Related: [[url-state-module-checks]], [[mutant-battery-scratch-copy]].
