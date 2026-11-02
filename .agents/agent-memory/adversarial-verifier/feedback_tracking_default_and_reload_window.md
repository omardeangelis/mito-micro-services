---
name: tracking-default-and-reload-window
description: Late-round spec gate checks - a prototype field whose untouched value follows a moving bound (count null = max), reload vs in-app return during an in-flight write, foreign reread during the send before a sticky failure text, pulse skeleton vs "no animations"
metadata:
  type: feedback
---

- **Untouched default that tracks a bound.** Grep the prototype's draft state for a `null` meaning "use the max" (`value = count === null ? max : Number(count)`). The spec usually says only "starts at the max". When the bound moves (ticking a person changes the max, a reread lowers it), the two readings give different summaries, labels and post-refusal states (valid "numbers changed" + active confirm vs red "Da 1 a <max>"). Also ask whether a programmatic value change counts as "touched".
- **Reload vs in-app return while a write is in flight.** Read the two sentences side by side: "after a reload the reopened page shows the numbers after" vs "returning in-app shows the numbers read at that moment". A long write (thousands of rows) is still running when the reload's read lands, so the first sentence silently demands a server guarantee (reads wait for in-flight writes) the spec delegated only for the uncertain-outcome case.
- **Foreign reread during the send.** If rereads not from the popover's confirm update the preview during the send, a non-rereading failure ("other error", sticky until edit/confirm/another reread) can start on an already-invalid preview with the confirm active.
- **"No animations" ACs.** Grep the design-system `Skeleton` for `animate-pulse` and the unchanged sections the page keeps (an embedded export section): its loading state pulses.

**Why:** home-admin gate round 9 (2026-11-02): all four survived eight text-only rounds.
**How to apply:** any prototype-derived spec with a numeric field bound to a changing max, an in-flight write the user can leave, or a no-motion AC. Related: [[review-fold-feasibility-checks]], [[async-focus-and-sticky-message-probes]], [[created-first-order-and-uncertain-reread]].
