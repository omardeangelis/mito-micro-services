---
name: sonner-browser-probe-pitfalls
description: Pitfalls when probing Sonner toasts with agent-browser (collapsed stack hides back toasts, default duration expires mid-probe)
metadata:
  type: feedback
---

When clicking inside a Sonner toast in a browser probe, a click on a back toast silently lands on the front one (stack collapsed), giving a false "handler never ran". Also the default 5 s duration expires between commands.

**Why:** a first probe of a toast link reported no navigation; the cause was the collapsed stack, not the code under review.

**How to apply:** raise probe toasts with `{ duration: Infinity }`, `hover "[data-sonner-toast]"` to expand the stack before clicking a back toast, and check `elementFromPoint` at the target's center before concluding a click is blocked.
