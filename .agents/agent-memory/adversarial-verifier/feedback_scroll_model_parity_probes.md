---
name: scroll-model-parity-probes
description: How to check a layout wrapper change (new fixed-height sheet around the page) for scroll/sticky/focus behavior parity, and how to diff a restyle against stored capture baselines; driver traps
metadata:
  type: feedback
---

When a change wraps every page in a fixed-height container (a "sheet" with `h-[calc(100dvh-…)] overflow-hidden`), the scroll moves from the window to an inner element and `sticky` bars that never stuck start sticking. Check:

- **Emulate the old chain on the live DOM** instead of building the old app: set the wrapper to `display: contents` AND `height: auto; overflow: visible`, then put the old rules inline on the inner classes. `height: inherit` follows the DOM parent, not the box parent, so `display: contents` alone keeps inheriting the wrapper's fixed height (my first emulation was wrong this way). Confirm with the stored baseline screenshot (old: pagination bar not visible at 800 px).
- **Real Tab and Shift+Tab loops** per list, comparing `activeElement` box with each sticky bar box and `elementFromPoint` at its centre. Newly pinned top/bottom bars without `scroll-padding` fully hide focused row controls (2.4.11). A sibling list that already has `scroll-pb-*` shows the team treats it as a rule. Skip hits where the focused control is inside the bar itself.
- **Plan premise check:** a plan saying "the sticky bars stay on the same container as today" can be wrong; IMPLEMENTATION-NOTES may admit the bars "did not stick before". Read both.
- **Parity diff:** re-run the baseline `capture.js` on the same URLs and diff headings/columns/fields/tabs exactly, buttons/links as multisets, and text lines as multisets plus order. A different seed account gives ownership diffs (read-only reason text, missing "Salva"/"cambia stato" buttons): attribute them before flagging.
- **Driver traps (agent-browser 0.27.1, macOS headless):** `press PageDown/Space/ArrowDown` with body focus scrolls nothing even when the window is scrollable, so keyboard-scroll claims can't be measured that way; `mouse wheel` over a non-scrollable area hung for minutes (kill the process). A `getComputedStyle` read right after toggling a class on a `transition-colors` row returns the old value: set `transition: none` inline first.
- **Click-absorbing wrappers:** a `div onClick={stopPropagation}` around a row checkbox that shrinks (48 to 30 px) turns near-misses into row navigation; if selection is local state of a sibling route, the selection is lost too.

Related: [[ui-pass-driver-artifacts]], [[focus-loss-and-toast-announce-probes]], [[design-system-spec-checks]]

Round-2 lesson (2026-10-29): a fix that sets a fixed `scroll-pt-N` equal to the sticky bar's default height passes the bare-list Tab loop but fails as soon as the bar grows. A filter bar that is `flex-col` gains a chip row when a filter or search is active (71 -> 105 px). Re-run the Shift+Tab loop with state put in the URL (`filter_by=...`, `q=...`) and measure the bar first; a class-constant test cannot see this. Also check sibling lists whose bars stuck before the change (baseline screenshot with pagination pinned) and report them as pre-existing, not new.

Round-3 lesson: a fix that measures the bar (`--filters-height` via ResizeObserver) is tested in jsdom with an RO stub that calls back inside `observe()`, so a mutant that drops `observer.observe(bar)` (measure once at mount) survives. Check whether the bar remounts on an interactive filter/search (`dataset.probe` marker on the bar: it did not), then emulate the mutant live by patching the layout's `style.setProperty` to drop `--filters-height` writes and re-run Shift+Tab: rows land under the bar. Headless agent-browser fires RO only when a frame is produced: read the var after a throw-away `screenshot`, not right after the click.
