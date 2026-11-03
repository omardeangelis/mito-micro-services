---
name: plan-component-owner-and-band-ties
description: Plan re-review checks - shared UI pieces created by a later task (forward deps hidden by reordering), loading states put on the wrong step, new priority band values that move manual priorities
metadata:
  type: feedback
---

After a plan reorders page tasks to fix forward dependencies, list every shared component each task's validation needs (date field, done screen, step footer button) and find the task whose `location` creates it. A reorder that fixes one edge (overview before first step) often creates another (overview needs the first step's date field; first step needs the done screen of the confirm task).

When a plan adds a background fetch on leaving step N, check which step first renders that data: the loading state is often specified for step N+2 while step N+1 already needs the data (initial selection "first option not 0").

When a plan adds new values to a computed sort band (125 above 120), grep the values a user can set by hand (`bandValue`: 20/60/100/120): manual values that tied with the old band now sort below the new one, even though the plan says "manual keeps its value".

**Why:** found in the second round of the assegnazione-wave plan review; all three survived a "fixed" claim.

**How to apply:** build a component -> creating task -> consuming tasks table for page plans; read the enum of hand-set values before accepting "same scale" claims. Related: [[feedback_plan_contract_first_and_constant_change]].
