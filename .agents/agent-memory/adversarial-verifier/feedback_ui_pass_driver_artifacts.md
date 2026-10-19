---
name: ui-pass-driver-artifacts
description: agent-browser 0.27.1 + ui-review probes give false or missing results on Radix overlays, portals and sticky bars; how to measure those by hand and what to double-check before reporting
metadata:
  type: feedback
---

Driver artifacts met in a UI pass of a Next/Radix app (agent-browser 0.27.1, headless Chromium 149):

- `set viewport` fires NO window `resize` event. The `resize` probe then reports every Radix/floating-ui popover as stale (`matchesFresh:false`, popover past the viewport). Falsify first: count `resize` listeners, then `window.dispatchEvent(new Event("resize"))`; the popover jumps to the fresh position. Not a finding.
- Radix portal content (Sheet, its popovers) is not in the SSR HTML: `edge` and `resize` right after their own reload fail with "trigger not found". Measure by hand: set viewport, open the URL, `screenshot` once (forces frames), `sleep`, `scrollintoview` + `click`, then `eval` the overlay box and `innerWidth - right`.
- Headless animations advance only when frames are produced: a Sheet measured straight after load sits at x = viewport width (`enter:running:0`). Take a throw-away screenshot before measuring boxes.
- `focus-ring` blurs each control: a non-modal Radix popover closes, so the next control is "not found". Walk it by hand (click trigger, ArrowDown/Tab, `eval` boxShadow and `:focus-visible`). A mouse-opened popover shows no ring on the auto-focused first item (`:focus-visible` false): normal.
- `focus-ring` scrolls each control to a convenient place, so it cannot see a sticky bottom bar covering a focused row. Do a real Tab loop and compare `activeElement` box with the sticky bar box (and `elementFromPoint` at its centre); prove the fix by injecting `scroll-padding-bottom` on the scroll container and repeating the loop.
- Escape while a non-focused popover is open inside a Sheet closes the Sheet (navigates away). Re-open before the next probe.
- A collapsed-sidebar state can be shown without a server write: `network route "**/api/user/preferences*" --body '{}'` makes the UI update locally; toggle back, unroute, and disclose the mocked POSTs. Opening Clienti still makes the app write `pref=ct` for real.
- `focus-ring` `ringKind:"outline"` with `ringStyle` ending `rgba(0, 0, 0, 0)` is the Tailwind `outline-none` transparent outline; the visible ring is the box-shadow. `enclosesTarget:false` on a Switch/date input means "label not inside the ring", a shadcn pattern, not a finding unless the label highlights as a whole.
- The `contrast` probe `hover` state exposes non-interactive elements whose primitive keeps `hover:bg-primary/80` (Badge): check hover on icons that carry meaning.
- Tailwind shell: a fixed 288 px nav leaves 87 px of content at 375 px, so narrow-width results are shell-limited; compare with an existing page and with the collapsed nav (64 px) before attributing them to the change.

**Why:** each of these cost a wrong or empty result in one run; the `resize` one would have been a false MINOR.
**How to apply:** before reporting an overlay/placement finding, reproduce it by hand once and name the engine; before reporting a probe result that contradicts the screenshot, suspect the driver.

Related: [[feedback_ui_pass_moving_target]], [[feedback_ui_probe_side_effects]], [[feedback_ui_pass_mock_trpc_responses]]
