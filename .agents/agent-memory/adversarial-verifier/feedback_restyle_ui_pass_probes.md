---
name: restyle-ui-pass-probes
description: How to run an AC13-style "every control shows the ring" check across a whole app in one pass, and the traps that gave false offenders or no result (transitions, oklch, pnpm axe path, removed forms plugin, bordered table container)
metadata:
  type: feedback
---

Checks that worked in a design-system restyle UI pass (Tailwind 4, Radix/shadcn, agent-browser 0.27.1, HeadlessChrome 149):

- **Whole-app focus-style scan.** Press Tab once (keyboard modality), then `el.focus()` each tabbable and read `outlineStyle/Width/Color/Offset` and `boxShadow`. Inject `*{transition:none!important}` first: with `transition-all` on buttons the read is mid-transition (`solid 3px currentColor off 0`) and every button looks like an offender. With it, only the real ones remain (raw `<button>`/`role=button` without the ring classes: `outline: auto 1px #005fcc`).
- **Clip scan, geometric.** For each tabbable, expand its rect by width+offset and compare with each ancestor's scroll extents (`scrollWidth/Height`, `clientLeft`), stopping at the first `auto/scroll` ancestor. Outline is not scrollable overflow, so a control flush with a scroll container's content edge is clipped there. Confirm each hit with `focus-ring` + a real Tab and a cropped screenshot.
- **ui-review `contrast` probe errors on oklch colors** ("Cannot read properties of null (reading 'a')"). Convert colors by painting on a 1x1 canvas and reading `getImageData`, then compute WCAG in the page.
- **axe in pnpm repos:** `node_modules/axe-core` is absent at the root; pass `AXE_CORE_DIR=<main checkout>/node_modules/.pnpm/axe-core@x/node_modules/axe-core`.
- **Removing `@tailwindcss/forms`:** grep inputs that have no `border-*`/focus utilities of their own (cmdk `CommandInput`, `type="text"` set by the lib). The plugin gave them a border and a focus ring; without it the field shows only the caret.
- **A table primitive that gains a bordered container:** consumers passing margin classes to the inner `<table>` (`mt-4`) now get an empty band inside the border above the header. Grep `<Table className=` for margins.

**Why:** the first focus scan reported ~30 false offender groups from transitions; the contrast probe gave no number at all; the two real regressions (cmdk field, table band) were only found by the grep + live check above.
**How to apply:** any restyle that touches focus styles, form-control base CSS or a shared container primitive. Related: [[ui-pass-driver-artifacts]], [[design-system-spec-checks]].

Shell: zsh does not split `$URLS`; macOS bash 3 has no `mapfile`. Keep URLs in a file and use `IFS=$'\n' read -d "" -r -a URLS < file` in a bash script.
