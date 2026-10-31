---
name: ui-pass-text-scale-and-oklch-probes
description: Text-scale emulation must re-run mount effects; contrast probe dies on oklch; layout-jump hangs; axe source path
metadata:
  type: feedback
---

Setting `documentElement.style.fontSize='20px'` AFTER load emulates 125% text but does not re-run mount effects (a scrollIntoView-on-selection reads as "selected tab cut" at 125%: false positive). Re-measure by changing the selection after the font change (`history.pushState` + `dispatchEvent(new PopStateEvent('popstate'))` drives React Router).

**Why:** the first strip run reported 12 "not whole" cases at 125% that vanished when the selection was changed with the font already scaled.
**How to apply:** for any "visible after selection/open" criterion at a scaled font, drive the change in-app, never by reload.

`probe.sh contrast` errors (`reading 'a'`) on oklch() colours: substitute an in-page canvas (fillStyle -> getImageData) composite, using `cs.fill` for SVG text. `probe.sh layout-jump` with a `js` popstate action hung past 120 s: use a PerformanceObserver + setInterval position log by hand. axe source: `AXE_CORE_DIR=<repo>/node_modules/.pnpm/axe-core@*/node_modules/axe-core`.
