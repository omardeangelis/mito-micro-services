---
name: filter-on-read-probes
description: A fix that filters a global store on read (by the current props) leaves the entry in the store; probe the "row comes back" path; and a probe assertion on a button after clicking it measures loading
metadata:
  type: feedback
---

When a fix hides stale client state by deriving from props (`pending.filter(id in data)`) instead of pruning the store, the stale entry is still there. Probe: rerender without the row, then rerender with it again (and unmount/remount, e.g. a Radix tab switch). In the operator-table review (2026-10-23) both paths brought back an invisible pending edit: the row's uncontrolled Select showed the original role, "Salva" was enabled and sent the old edit.

Probe trap: I captured the "Salva" element, clicked it, then asserted `disabled === true`. It passed on code that had just sent the request, because `loading` was true at that instant. Log the state before the click and assert on the mock calls, not on the button after clicking it.

**How to apply:** for every "derived from props" fix, add a vanish-then-return probe and a remount probe; read kill/pass evidence from logged state before the action.

Related: [[vacuous-test-patterns]], [[storage-draft-checks]]
