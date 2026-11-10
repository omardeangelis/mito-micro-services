---
name: ui-pass-scrolled-focus-and-null-text-links
description: UI-pass checks that focus-ring misses: Tab into a partly visible control of a scrolled table, links whose text comes from a nullable field, square sticky cells on rounded cards
metadata:
  type: feedback
---

`focus-ring` starts from an unscrolled table, so it reports clean. Scroll the table to the end, focus the sticky button, press Tab and read `scrollLeft` plus the control's box: Chromium does not scroll a control that is still partly inside the scroller, so the ring and the name stay cut off.

Run axe with a detail open and the real seed payload, not only with hand-made names: a link whose text comes from a nullable column renders as a 0 x 0 tabbable anchor, and hand fixtures usually fill every name.

An opaque sticky cell in the last row of a table inside a rounded card with no `overflow: hidden` covers the corner arc: crop the corner at rest and on hover, enlarged with nearest-neighbour (PIL is available).

**Why:** home-admin UI pass: both focus problems passed the sweep and the probe, and were found only by these steps.
**How to apply:** any table that scrolls inside its container, and any detail that renders nullable data. An async `eval` can take 30 s or more on the shared machine and blocks the session daemon: run it detached with a bounded wait, not in a sweep. Related: [[feedback-ui-pass-driver-artifacts]].
