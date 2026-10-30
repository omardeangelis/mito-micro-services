---
name: js-media-query-vs-rem-breakpoint
description: A JS matchMedia in px next to a Tailwind breakpoint in rem disagree when the browser default font is not 16px; inline html font-size cannot show it; CDP Page.setFontSizes can; fast key presses read stale DOM
metadata:
  type: feedback
---

When a component reads a breakpoint in JS (`matchMedia("(min-width: 1280px)")`) and the CSS uses Tailwind's `xl:` (`80rem`), the two agree only at a 16px browser default font. Setting `document.documentElement.style.fontSize = "20px"` does NOT reproduce the user setting: media-query rem uses the initial (UA default) font size, so both still switch at 1280 and the probe passes vacuously.

**Why:** in pagina-analisi (2026-10-30) the tablist kept `aria-orientation="vertical"` and ↑/↓ keys while the CSS laid it out as a horizontal strip at 1280–1599 px with Chrome's font at 20px, and the selected tab was not scrolled into view. Only the real default-font change showed it.

**How to apply:**
- Grep for `matchMedia(` with px next to `sm:/md:/lg:/xl:` classes; compare `matchMedia(px).matches` against `matchMedia("(min-width: 80rem)").matches`.
- Reproduce with CDP: `agent-browser get cdp-url`, then a node script (global WebSocket) that finds the page target via `/json/list` and sends `Page.setFontSizes {fontSizes:{standard:20, fixed:13}}`. The setting is lost on reload, and after it a `set viewport` resize may not fire the matchMedia change event, so open the page fresh at each width and then set the font.
- Key probes: with `agent-browser press` 150 ms apart, a heavy re-render makes the DOM read 50 ms later look wrong. Record `aria-selected` at keydown time (capture listener) and check that each key's "before" equals the previous key's expected result, or wait 600+ ms between presses.

Related: [[feedback_ui_pass_text_scale_and_oklch]], [[feedback_ui_pass_driver_artifacts]]
