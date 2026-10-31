---
name: capped-chart-note-and-jump-probes
description: Checking a "draw first N, note the rest" chart change - note shown under empty states, notes below a fixed area still move the next section, cap tests with order-coinciding fixtures
metadata:
  type: feedback
---

Three checks that found real issues on a "chart draws at most N bars + a note" change:

1. **A data-derived note rendered whatever the status.** The panel printed `result.notes` under every state, so «the chart shows the first 8 of 27: the table and the file list them all» appeared under an empty state with no chart, no table and disabled export. Find a window where the status is empty but the rows still come back (here: a window that ends before the "complete since" day, which the server still answers with rows). Probe it live, and read where the notes list is rendered relative to the status switch.
2. **"As tall as the skeleton" with notes below the area.** A fixed-height area is not enough: the notes list sits between the area and the next section, so that section moves when loading ends. Run a rAF sampler that logs the top of the next section's heading and whether the skeleton is present, then change the window through the real control (combobox click + option). Do not trust a claim like "stays at N px in every frame": it contradicted the measurement (655 -> 583 skeleton -> 635).
3. **Cap tests whose fixture order matches every other order.** Here input order = sort order = name order and there were no small samples, so mutants that took the bars from the unsorted input, by name, or ignoring "small samples last" all survived, even though the assertion (bars == first N table rows) had the right shape. Seed the fixture so the input order and the name order both differ from the table order, and put a high-rate small sample in it.

**Why:** the unit tests and the class assertions (`h-80` on the area) were green while the user-visible copy was false and the section below still jumped.
**How to apply:** include an equivalent mutant in every battery as a harness check (here `operators - 0`; it "killed" at first because python launched x64 node, see [[disabled-message-and-x64-runner]]). Related: [[sort-fixture-vacuity-and-runner-race]], [[mutant-battery-scratch-copy]].

**Round after "notes inside a fixed flex box" (2026-10-30):**

4. **Class tests cannot hold a flex layout.** Removing `flex flex-col`, `flex-1`, `min-h-0` or `shrink-0` from the box all survived (the tests pinned only `h-80` and containment). Show the user impact in the live page instead: `area.classList.remove('flex','flex-col')` took the chart from 232 px to 0. A JSX-breaking mutant "kills" every file at import: read whether the FAIL lines are file-level before counting it.
5. **A box with no floor for the chart.** Narrow the panel with `section.style.maxWidth` (200–400 px) at root font 16 and 20, and measure the chart height, overlapping SVG text, and notes past the box bottom. Phone widths with the sidebar open (panel 89 px) gave a 0 px chart and notes 312 px over the next section.
6. **The number row moves too, not only notes.** A legend in a `flex-wrap justify-between` row next to the number wraps when the panel is narrow (768 px with the sidebar open, operator role with 3 legend items): +32 px at font 16, +40/+65 px at 20. Sample the first load at 768 for each role, not only at 1024/1440.
7. **First-load sampler:** `agent-browser addinitscript` does not exist (0.27.1). `Page.addScriptToEvaluateOnNewDocument` lasts only while its CDP websocket stays open, so do `Page.setFontSizes` + `Page.navigate` + `Runtime.evaluate` from that one node script.
8. **Render-boundary state:** walk `__reactFiber` up from the chart node to the class with `reset`, then call `setState({failed:true})`. Data notes ("the chart shows the first 8") still showed under the error box.

**Round after "legend moved into the fixed box" (2026-10-30):**

9. **Forcing the skeleton:** `agent-browser --init-script <file> open …` (0.27.1 has the flag, set before the first navigation of the session) with a `window.fetch` wrapper that delays `/api/v1/analytics/` by a localStorage value, plus a rAF sampler of the next section's top and skeleton presence. Effect's `FetchHttpClient` calls `fetch(URL)`, not a string: read `input instanceof Request ? input.url : String(input)` or the delay silently never applies (skeleton gone at 390 ms). Closing the session drops the login cookies.
10. **Half-revert mutant:** besides the full revert (legend back in the number row, killed), render the legend in BOTH places. It survived the structural test (which only read the box's children) and DOM injection showed it restores the +32/+65 px jump. Also: `toBeVisible()` in jsdom cannot see Tailwind classes, so a `hidden` class mutant survives a "visible" assertion.
11. `justify-end` on a row holding a `flex-wrap` list right-aligns only while it fits: once it wraps, the list is full-width and its items go left. And a legend outside the error boundary stays above the boundary's error box.
12. Python mutant runner on this Mac: prefix vitest with `arch -arm64` (x64 python launches x64 node: rolldown "Cannot find native binding").
