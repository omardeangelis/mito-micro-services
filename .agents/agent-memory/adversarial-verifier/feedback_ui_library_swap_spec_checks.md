---
name: ui-library-swap-spec-checks
description: Checks for a spec that swaps a UI library (Radix Toast -> Sonner) while claiming tests and behaviour stay the same
metadata:
  type: feedback
---

A spec that replaces a UI primitive library and says "tests keep the same assertions, only mounting changes" is usually false: grep the tests for library-specific hooks before accepting it.

**Why:** in the toast-sonner draft (2026-10-31) the claim failed on three files: a test reading Radix's announce node text ("Notifica ..." prefix) and `getByRole("region")` label, a test reading `li[data-state=open]` plus `bg-*` classes, a test reading `rounded-sheet`/`shadow-pop` classes. Also a counter test using `toast().id` (Sonner returns the id itself).

**How to apply:**
- `rg -n 'data-state|role="status"|getByRole\("region|Notifica|className' ` over the tests that mention the component; list each file the swap forces to change.
- Cross-check the other spec's parity gate (design-system-web AC24 has a closed list of test files that may change).
- Radix `DismissableLayer.Branch` exempts the toast viewport from a modal's outside-pointer dismissal; a library toast rendered in place is not a Branch, so pressing it with a Sheet/Dialog open dismisses the modal even when pointer-events is fixed. A spec AC "the toast can be pressed with a Sheet open" must also say "and the Sheet stays open".
- Read the new library's CSS for defaults that fight the design system (font-family stack, focus ring colour, title weight) and check each against the DS ACs the spec does not list as changing.
- Behaviours that disappear silently: Radix closes on Escape (`onEscapeKeyDown` -> handleClose) and on Ctrl/Cmd-click of an `asChild` action (no preventDefault -> Close runs); Sonner's F8-style hotkey sets `expanded`, which freezes every timer until Escape or mouse leave (onBlur never resets it).
- Fetch the library source at the tag (`curl raw.githubusercontent.com/.../vX/src/index.tsx`) needs `dangerouslyDisableSandbox`; and a prop such as `customAriaLabel` can make an apparently unreachable exact label feasible, so grep props before calling an AC infeasible.
