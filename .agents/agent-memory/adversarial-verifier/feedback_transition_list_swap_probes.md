---
name: transition-list-swap-probes
description: How to check a restyle that swaps Tailwind transition lists and ring->outline focus; token-level motion diff, focusin getAnimations log, pause+currentTime scrub, charter premises that name the wrong selector
metadata:
  type: feedback
---

Checks that found the real defects in a motion pass over a shadcn restyle (Tailwind 4, Radix, agent-browser):

- **Token-level motion diff first.** A 30-line script that tokenizes the className strings of HEAD and working tree per file and prints the multiset difference of `transition*|animate-*|duration-*|delay-*|ease-*|fade-*|zoom-*|slide-*|motion-*` proves which primitives changed motion at all (here only six files) and that nothing else moved. Grepping `+`/`-` lines misses re-ordered classes.
- **`transition-colors` in Tailwind 4 includes `outline-color`.** Moving a focus ring from box-shadow to `outline` while the base state has no outline colour makes the ring start in `currentColor` and fade to the ring colour (near-black on unchecked checkbox and switch, white on a checked one). Probe: press Tab once (keyboard modality), `focus()` each control, log `getAnimations()` (`transitionProperty`) at `focusin` and sample `outline-color/width/offset` per rAF. `transition-all` Buttons tween outline-color+offset+width (starts 3 px).
- **A new bg/border-color property in a transition list is a new animation**, not "the same transition". Sample bg, border and the icon `color` per rAF around a click: the check icon inherits the animated `color` (muddy grey on pale indigo mid-way), and Radix Indicator unmounts at once on uncheck while the box fades. HEAD's list was `transition-shadow`, so compare against the source of HEAD, not against "it looks fine".
- **Sibling components with the same look can have different property lists** (Tabs `transition-all` vs ToggleGroup `[color,box-shadow]`): sample bg, border, shadow and colour on both; the second snaps bg and border and fades the rest.
- **Scrub, don't guess:** click, two rAFs, `document.getAnimations().forEach(a => { a.pause(); a.currentTime = N })`, then screenshot. `style.zoom = 6` on the control's parent makes a 2 px ring readable. Finish animations before the next toggle.
- **A charter can name the wrong selector.** The brief said `.dashbaord-layout` and "sidebar links" kept `transition-all`; computed `transition-duration` was 0 s on both, the transition lives on `.dashabord-container` (inert: `getAnimations()` during a sidebar toggle lists only NAV width and ASIDE min-width). Always read computed style on each named element before judging it.
- **Fixed-position siblings of an animating container are not clipped by its `overflow-hidden`.** The bottom block of a sidebar (`fixed`, width set by a class, no transition) jumps to the new width at frame 0 while the nav animates; its active pill overlays the page. Sample `getBoundingClientRect` of nav, bottom block and the page per rAF.
- **Frame gaps on a shared machine** (load 9-14) are not attributable without a base run; say HEAD was not measured and that the server may not be started.
- Harness: `agent-browser --session X` inside a zsh `$S` variable is not word-split; export `AGENT_BROWSER_SESSION` instead. `hover` in agent-browser does not turn on `:hover`: read the compiled rules (`@media (hover: hover)` wrapping) from `document.styleSheets`.

**Why:** motion-craft pass on the design-system-web change (2026-10-29), checkbox/radio fade, outline-colour flash, toggle-group desync, sidebar fixed block.
**How to apply:** any review of a diff that edits transition property lists, swaps focus-ring technique, or restyles Radix controls.

Related: [[feedback_motion_exception_scope]], [[feedback_design_system_spec_checks]], [[feedback_ui_pass_driver_artifacts]]

Round-2 lessons: (1) Grep every remaining `transition-colors|transition-all|transition` next to `focus-visible:outline` after a fix; one secondary primitive (a toast action) kept the tween. Probe it by injecting an element with the same classes, pressing Tab once and sampling outline-color per rAF. (2) Before calling a raw button's tween new, inject a `div tabindex=0` with the same transition classes and no author outline rule: Chrome's UA `auto` ring also tweens outline-color under `transition-colors`, so the tween pre-existed for raw buttons.
