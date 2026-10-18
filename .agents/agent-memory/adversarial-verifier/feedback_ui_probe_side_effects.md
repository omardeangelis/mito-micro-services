---
name: ui-probe-side-effects
description: ui-review probes that click for real (hit-area) mutate data when aimed at action buttons; how to avoid it in read-only UI passes
metadata:
  type: feedback
---

`ui-review` `hit-area` sends real mouse clicks at the control and "restores" only toggles, not server mutations. Aimed at "Assegna a te" in a customer sheet it assigned the test customer to the admin (dev DB changed) despite a read-only brief.

**Why:** the probe cannot tell a toggle from a mutation; `stateRestored: true` only means the DOM state is back.
**How to apply:** in a read-only UI pass never run `hit-area` on a button that fires a mutation (assign, create, save, state change). Measure its box with `eval` getBoundingClientRect and skip the click probe, or `network route --abort` the mutation endpoint first (this worked for toast checks: abort `**/api/trpc/<proc>*`, then unroute). `focus-ring` and `contrast` (hover/focus) do not click and are safe.

Also: in zsh an unquoted `$dim` is not word-split, so `set viewport $dim` fails; split with `${dim% *}` / `${dim#* }`.
