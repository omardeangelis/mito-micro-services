---
name: third-party-css-motion-checks
description: How to verify motion claims about a library's injected CSS (Sonner and similar): read the injected string, check which attributes JS actually sets, and check selector reach for reduced-motion rules
metadata:
  type: feedback
---

Verify a library's motion from the code it actually ships, not from its stylesheet file alone.

- Read the CSS string injected by the bundle (for Sonner, `__insertCSS(` in `dist/index.mjs`) and compare it with `dist/styles.css`. Use `python3 -I` for searches: `grep -o` with `.{0,N}` patterns hits ugrep complexity limits on the minified bundle.
- A rule keyed on an attribute (`[data-lifted=true]`, `data-expanded`, ...) is dead if the JS never sets that attribute. Grep the JS for the attribute name before counting a rule as live.
- A reduced-motion rule written as `[x] > *` covers direct children only. Check the markup nesting (which elements are direct children) before accepting that everything inside is covered; `svg` inside an icon wrapper is not.
- A library's internal timer can cut its own exit transition short (Sonner removes the node at 200 ms while the exit transition is 400 ms). Documented durations must match what the user sees, so read both the transition and the unmount timer.
- Keyboard-triggered state changes reuse the same transitions as pointer ones: check every shortcut the spec mandates against the frequency and keyboard rule of the motion bar.

**Why:** in the Sonner review (2026-10-31) a documented "400 ms" exit and an "F8 is not animated" assumption were both wrong on the code level; the first required reading the unmount timer, the second required reading the hotkey handler.

**How to apply:** for any motion review of a third-party component, open the injected CSS string and the JS that sets state attributes before writing a finding or a pass.
