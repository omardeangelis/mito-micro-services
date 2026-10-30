---
name: token-meaning-map-probes
description: Gate a Tailwind 4 token/meaning-map implementation from source: unresolved-utility sweep via candidatesToCss, spec-table vs @theme diff, twMerge probe, mutant battery with vitest related; what survives
metadata:
  type: feedback
---

Probes that worked on a Tailwind 4 `@theme inline` design-system change (all read-only, scratch dir):

- **Unresolved utilities:** `__unstable__loadDesignSystem` from `@tailwindcss/node` (path under `node_modules/.pnpm/@tailwindcss+node@*/`), load the real `globals.css` with `{base}`, then `ds.candidatesToCss(words)` returns `null` for a class that makes no CSS. Run it on every quoted string of the non-test sources; flag words invalid inside a string where >=50% of the words are valid (finds typos like `text-md`, ignores prose). `vite build --outDir <scratch>` gives the emitted CSS: grep `--color-*` to see which theme vars Tailwind emitted (a JS-only `var(--color-x)` is emitted only if the literal string is in a scanned source).
- **Spec table vs CSS:** parse the Appendix A/B markdown tables with a script and diff against `:root`. Forms like `primary-soft / -border / -foreground` and `*-foreground` break a naive parser: expect false "EXTRA/MISSING" and check those by hand.
- **twMerge:** `node --experimental-strip-types` can import the repo's `utils.ts` directly (Node 22.17). Test pairs: custom size vs colour (`text-xxs text-foreground`), custom weight vs `font-sans`, partial radius vs custom radius. A CSS-property oracle for "dropped sibling" gives false positives on `rounded-l-*` vs `rounded-card` (later shorthand correctly wins) and is useless for the reverse (box-shadow shared by ring/shadow).
- **Mutant battery:** copy `apps/web` to scratch (rsync, node_modules symlink, realpath keeps `@mito/*`), runner in **node** (python subprocess runs x64 node and rolldown crashes), `vitest related --run <mutated file>` is ~4 s per mutant. Control mutants must die. Copy-env failures (root deps like `xlsx`, `next.config.js`) are baseline: filter lines with ` [ `.
- **What survived (30 meaning mutants):** 22 survived (8 killed): DeltaBar red/green, BadgeDelta colours, blacklist row tint (both directions), export series/teal bar, deadline today/overdue swap, filter counter, drop-zone dragging, selected-count, "Risolvi alert", assign-dialog disc, new-pratica success box, progress track, superseded banner, previous-row text, grid stroke, tooltip surface, donut 6th colour (the 6-sedi test checks names only; the colour test uses 7 sedi where slot 6 is "Altre"). `tokens.test.ts` pinned colours and shadows but all 12 Appendix C mutants in `globals.css` (radius, text size, weights) survived: a text test of the CSS file is the only possible pin in jsdom.

**Why:** tests that "keep their assertions" give no protection to the new meaning table; source reading found it correct, so these were MINOR, but they are the first thing to regress.

**How to apply:** for any restyle gate, run the sweep + table diff first (cheap, decisive), then the mutant battery on the meaning rows; report survivors as a list with the mutation. Related: [[feedback_design_system_spec_checks]], [[feedback_mutant_battery_scratch_copy]], [[feedback_disabled_message_and_x64_runner]].
