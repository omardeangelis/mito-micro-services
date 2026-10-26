---
name: degraded-ui-pass-ssr-probes
description: UI pass with no browser: SSR-render the installed chart/badge library from a mktemp dir to read real markup for edge props; Tailwind CLI to prove dynamic colour classes exist; threshold-colour tests miss the exact boundary
metadata:
  type: feedback
---

When a UI pass has no route (DEGRADED), code reading alone is weak. Three cheap, read-only substitutes worked:

1. **SSR the library component.** `mktemp -d`, symlink the repo `node_modules`, write a `.cjs` that `require("@tremor/react")` + `react-dom/server` `renderToStaticMarkup`, and print the markup for the edge prop: a `null` category name (tooltip row rendered an empty `<p>`), a `DeltaBar value` of 250 (inline `width:250%` inside a `w-1/2` wrapper, no clamp). Deep paths such as `.../DonutChart/DonutChartTooltip.cjs` are requirable. Transitive deps (recharts) are not top-level under pnpm: require them by their `.pnpm/...` absolute path.
2. **Dynamic colour classes.** A colour a component only passes now (a bug fix made `yellow`/`blue` reachable for the first time) may not exist in the CSS. Run `./node_modules/.bin/tailwindcss -c tailwind.config.ts -i <scratch in.css with @tailwind utilities> -o <scratch out.css>` from the repo and grep the class. Here the safelist covered it, so the hypothesis died.
3. **Threshold colour tests.** Fixtures usually hit `x`, `x+1` for two of three thresholds and skip the third (here 25/26 and 75/76 but not 50). Enumerate the fixture values against a `>=` mutant before believing the test pins the boundary; then confirm with a mutant run: copy component + test into a mktemp dir, vitest config `{esbuild:{jsx:"automatic"}, test:{environment:"jsdom", globals:true}}` (RTL auto-cleanup needs `globals: true`, else every test after the first fails with "multiple elements"), grep-check the sed applied, include one control mutant that must die.

**Why:** the review brief forbade stating measured values; these gave concrete evidence (markup, emitted CSS, surviving mutants) without a browser or a repo edit.

**How to apply:** every DEGRADED UI pass: list the library-edge states (null label, out-of-range value, empty data, zero total), SSR each, and report what was seen as "markup of the installed library", with the browser check kept as UNVERIFIED. Also check a card that shows one number in two places: tests often assert only one. Related: [[feedback_mutant_battery_scratch_copy]], [[feedback_vacuous_test_patterns]].
