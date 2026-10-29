---
name: design-system-spec-checks
description: How to gate a restyle/design-system SPEC and PLAN: token recompute, test selectors (color and size), twMerge for new theme keys, page wrappers, engine claims
metadata:
  type: feedback
---

Checks that found the real defects in a restyle spec (tokens + component looks + "tests keep their assertions"):

- **Recompute the prototype's tokens, don't eyeball them.** Cut the `<script>` range from the color helpers to just before the export table (`sed -n "${S},$((E-1))p"`), append `build(PRESETS.find(id).cfg)` and print hex/oklch; diff against the spec tables. Then a 20-line WCAG luminance script on the hex values for every pair the spec claims AND the pairs it omits (chart dots on white, switch-off, input border, disabled text).
- **"Only color-class assertions may change" is usually unsatisfiable.** Grep tests for `getAttribute("stroke"|"fill")`, `style.backgroundColor`, hex literals, icon selectors (`svg.lucide-*`), focus classes (`focus:ring-inset`), size classes (`h-9`, `w-40`, `.text-2xl`). A restyle that removes hex palettes, swaps icons for shapes or changes focus/size rules breaks those non-class assertions.
- **Prototype-only elements leak into ACs.** For each AC naming a UI element (selection bar, page title, top bar), grep the app for it; a claude.ai/HTML prototype often shows elements the app never had, so the AC is vacuous or forces a content change.
- **Prior specs and REPORTs pin colors.** Grep `brain/specs/*/SPEC.md` and `REPORT.md` for colore/verde/3:1 on the components being restyled (a card whose color follows a threshold, chart slices fixed to >= 3:1 on white). Code comments that cite a roadmap rule for keeping colors are evidence of how the team reads that rule.
- **Every existing color meaning needs a target.** List palette classes per file (`rg -c` with a palette regex) and map each meaning (row tints, deadline today/overdue, import status badges, info alerts, blacklist variants) to a spec table row; unmapped ones are a coverage gap once a "no palette classes" lint lands.
- **Re-gate after a rewrite:** a fix for contrast (darker chart color) can collapse distinctness with its neighbor. Compute CIEDE2000 plus a Machado CVD simulation for adjacent slices in their real order, and compare against today's palette minimum. A rewritten count rule ("tiene N fette") must be checked against the code's overflow branch (N-1 named + "Altre") and the test names that pin it.
- **Re-run the test-class grep on every rewrite:** a structural selector built on a color class (`closest(".bg-neutral-50")`) is easy to miss in a "files that may change" list.

**At PLAN level (design-system plan review, 2026-10-29):**

- **A type-scale remap breaks size-class selectors.** When a plan redefines `--text-2xl` (titles 24->20) and moves the 24 px figures to a new token, grep tests for `querySelector(".text-2xl")`: one outside the allowed-change list makes the decision contradict the test-parity AC. Prefer "keep the class the test reads, add a new token for the other group".
- **New theme keys need `extendTailwindMerge`.** tailwind-merge 3 defaults: `text`/`radius`/`shadow` are t-shirt only, `font-weight` a fixed list. Unknown `text-x` = color (drops the neighbor color), `font-x` = family (does not override `font-semibold`), `shadow-x` = shadow-color. Tailwind 4 breaks same-property ties by candidate name (`Pt(m.candidate,c.candidate)` in `dist/lib.js`), so both classes survive and the alphabetically later one wins: silent wrong weights that jsdom class tests pass.
- **"Every page on a sheet" ACs: grep each page's wrapper.** List `className` of the top element per route (typo classes, `bg-white` boxes, centered `max-w-*` cards, pages without the container) and the sticky bars / `scroll-pb-*` that depend on the scroll container. A CSS-only task on the shared classes rarely covers them.
- **Body text "without its own size":** check `index.html` body and the `body` base rule for a font-size; remapping `text-sm`/`text-base` doesn't reach unsized text (16 px).
- **Engine claims:** run `agent-browser --help | grep -i engine`: chrome/lightpanda only, WebKit only via `-p ios` (Simulator + Appium), no Firefox. A plan spike "Chrome, Firefox, Safari" can't run as written.
- **CSS var colors in jsdom:** a 10-line JSDOM probe showed jsdom 30 keeps `var(--x)` in `style.backgroundColor`, so var-based chart colors stay assertable; a `getComputedStyle` fallback returns "" in jsdom.
- **File ownership vs gate areas:** for each shared file (e.g. `select.tsx`), check that the task that owns its gate area is the one whose description edits every violating line; "content belongs to the other task" in the same wave is a parallel same-file edit.
