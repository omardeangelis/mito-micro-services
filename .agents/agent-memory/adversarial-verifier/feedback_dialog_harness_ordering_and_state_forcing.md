---
name: dialog-harness-ordering-and-state-forcing
description: Pitfalls and tricks for live dialog focus/layout harnesses - capture-listener order, reaching write-gated steps via React state, false off-axis from split text nodes
metadata:
  type: feedback
---

Capture-phase listeners on `focusScope.autoFocusOnMount`: a reference-rule handler that calls `stopImmediatePropagation` blocks every capture listener registered AFTER it on document. An injector (adds a redirecting/hidden control before the rule runs) must be registered first, else the "reference" run compares against an un-injected DOM and looks different for a fake reason. Check the injected node exists after the run.

A step gated by a write (bulk "success" screen after a server action that can't be mocked): walk the React fiber from `[role=dialog]` up to `type.name === '<Component>'`, collect hooks with `queue.lastRenderedReducer.name === 'basicStateReducer'`, dispatch the right boolean. Real render, real remount + autofocus, zero writes. Don't JSON.stringify hook states (QueryClient is circular).

Centring probes: `Range.selectNodeContents(el).getClientRects()` returns one rect per text node, and React splits `{count} text` into separate nodes, so a centred line shows fake offsets (+4 px, -114 px). Merge rects by line top before measuring the axis.

Also: a header that looks off-axis or under the X may be a grid-track widening from ANOTHER child (cards, footer). Compare the track with the header's classes swapped to the previous version: identical numbers = not caused by the header change.

**Why:** each of these produced a false finding candidate in one run.
**How to apply:** any live harness comparing a wrapper's focus rule with Radix, or measuring header centring/X overlap. Related: [[shared-primitive-regression-checks]], [[feedback-query-error-and-pixel-probes]]
