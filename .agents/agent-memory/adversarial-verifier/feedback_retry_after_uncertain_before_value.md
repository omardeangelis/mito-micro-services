---
name: retry-after-uncertain-before-value
description: Probes for confirm buttons after an uncertain outcome - "before" captured at click is overwritten by the reread; same-task double click
metadata:
  type: feedback
---

When a write records "what it was before" in a ref at click time (toast «Prima era …»), check the retry after an uncertain outcome: the reread updates the page, the retry click captures the new value, and the toast says the old day equals the new one. The server repeat branch ({before:X, after:X}) exists exactly for this path, so tests of "another admin saved meanwhile" without a reread do not cover it.

Probe: fake write-then-uncertain (set the fake state by hand, outcome "uncertain"), wait for the reread, clear the outcome, click again, read the toast.

Also: a `!pending` guard read from the render closure leaves a same-task window. `fireEvent.click` twice in one task sends two requests with different requestIds; one `setTimeout(0)` between them closes it. Report as MINOR (not human-reachable), with a ref guard as the fix.

**Why:** found 2026-11-04 on the Wave «Proroga» and «Assegna» (assegnazione-wave); the existing tests were green.
**How to apply:** any idempotent retry path or confirm button with a pending state. Run it in an out-of-tree copy ([[out-of-tree-vitest-probe]]).
