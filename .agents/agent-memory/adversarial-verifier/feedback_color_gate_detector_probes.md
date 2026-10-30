---
name: color-gate-detector-probes
description: How to check a regex "no colors outside tokens" gate and its ESLint import ban: recall on legacy tree, Tailwind compile, mutant battery, plant test, lintText across config blocks
metadata:
  type: feedback
---

Checks that found the real holes in a color gate (detector `findColorViolations` + per-area vitest + `no-restricted-imports`):

- **Ask Tailwind, not your memory, whether a spelling matters.** Load `node_modules/.pnpm/tailwindcss@x/node_modules/tailwindcss/dist/lib.mjs` `compile(globals.css, {loadStylesheet})` from a scratch .mjs and `build([candidates])`: it showed `bg-[red]`, `inset-shadow-xs`, `drop-shadow-xs`, `text-shadow-xs`, `shadow-(--x)` render real color/shadow while `--shadow-*: initial` only clears box-shadow, and the detector missed them. Palette classes render nothing once `--color-*: initial`.
- **Deny-list shadows are a trap.** A detector that lists TW default shadow names lets every unlisted spelling pass (prefixed families, `(--var)`, style `boxShadow: "... var(--x)"`, CSS `box-shadow` without a literal color).
- **Recall on the legacy tree.** `git archive HEAD <src>` to scratch, run the detector, then a much broader line grep (palette words, named colors, fill/stroke/color keys, hsl/rgb, shadow) and print lines with a broad hit and no detector hit. At HEAD the only miss was the whole-file tokens exemption (`color: var(--color-gray-400)` inside a rule of globals.css).
- **Comment-blank heuristics:** compare regex-blanked ranges with TypeScript trivia (createRequire from the package to load `typescript`); JSX `{/* */}` and comments in empty blocks show as false "non-comments", ignore them. Then probe by hand: ` // ` in a string or JSX text, ` /*` in a string (swallows to the next `*/`). Check that the tree test AND the unit test both pin them with a mutant ("any // is a comment" survived 20/20).
- **Mutant battery on the detector** (scratch copy, vitest root = scratch, node_modules symlink): 42 of ~60 regex mutants survived the 11 unit tests, and the tree test cannot kill detection mutants because the tree is clean. Separate equivalent mutants (OPACITY, ARBITRARY covered by HEX/FN/VAR detectors).
- **Plant test for area logic:** copy `src` (git ls-files -co) to scratch, append a violation in an area file / a new dir / `*_test/` dir / `src/test` / `.js .svg .scss` and run only the tree test. `file.includes("_test/")` also excludes any dir ending in `_test` (e.g. `ab_test/`); extensions outside ts/tsx/css are never read.
- **ESLint ban probe:** one node process with the `ESLint` class, `lintText(text, {filePath})` on EXISTING files of each config block (type-aware projectService errors on non-existent paths; `--stdin` per form costs ~10 s). `importNames` pattern also blocks `import * as` and `export *` of ANY module in the group; dynamic `import()` and relative paths are not covered.
- **Do not `mkdir -p` inside the repo in a loop** (I created `src/routes/foo/_test` once and had to rmdir it); build probe dirs only under the scratchpad.

Related: [[design-system-spec-checks]], [[vacuous-test-patterns]]

Round-2 additions: (1) an allow-list of property keys is the same trap as a deny-list of shadows: probe keys outside it (`borderTop`, `borderLeft`, `backgroundImage`, `textDecoration`, quoted `"color"`, custom properties `"--x": "red"`, CSS `background-image`, `border-inline-start`). (2) CSS system colors (`Canvas`, `CanvasText`, `GrayText`) are not in the named-color list; Tailwind renders `bg-[Canvas]`. (3) lucide/SVG `color="white"` paints the stroke; a detector that skips `color=` for chart-tone props misses it. (4) `shadow-xs/50` and `shadow-<token>` change a token shadow. (5) End-to-end plant: write the violation into a new file of a scratch copy and run only the tree test; that is the CI evidence, not the unit probe. (6) Mutant runner in JS: `${B}` is not interpolated inside double-quoted strings; write backslashes as a placeholder (`~`) and replace, and always print the NOT-APPLIED list.

Round-3 additions: value-capturing regexes that stop at the first quote miss ternaries (`color={ok ? "white" : "black"}`, `style={{ color: ok ? "red" : "blue" }}`); a `var()` blanker also blanks its fallback (`bg-[var(--x,red)]` renders red); `bg-linear-[red,blue]`/`bg-radial-[…]`/`bg-conic-[…]` are not `bg-[`. Unquoted identifiers that are system-color names (`field.color`, `highlight ? …`, `canvas`) are false positives. Python runner must launch arm64 node (see [[disabled-message-and-x64-runner]]): first battery read 84/84 killed from a startup error.
