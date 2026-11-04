---
name: ui-pass-probe-traps-row-click-and-tab-walk
description: UI-pass probe traps: hit-area reads 0.6% on rows whose tr onClick toggles; focus-ring with high maxTabs can activate controls; zsh quoting of session flag
metadata:
  type: feedback
---

hit-area uses elementFromPoint equality with the control, so a row toggled by a `tr` onClick reads as 0.6% coverage: confirm with real mouse clicks across the row (move/down/up) and read the toggled state instead.
focus-ring with `maxTabs` 40 on a page with action buttons left the flow in a different state (a later step ran); keep maxTabs low or use `controls` after forcing the state, and re-check the page after each probe.
zsh does not word-split `$A="agent-browser --session x"`: use `export AGENT_BROWSER_SESSION=...`. `scrollIntoView` on a truncated cell scrolls its overflow-hidden content (fake left clip).
A link inside a `truncate` cell that is `inline-flex` does not ellipsize: it overflows, gets hard-clipped and the focus ring is cut (found on the import history).
**How to apply:** UI pass on tables with clickable rows and links in truncated cells.
