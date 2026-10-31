---
name: library-swap-spec-round2-checks
description: Second-pass checks on a UI-library-swap spec (Radix Toast -> Sonner) that already fixed the first round: unit-by-unit AC numbers, vacuous negatives, global keys, same-title twins, other specs' ACs
metadata:
  type: feedback
---

When a swap spec is revised after a first review, re-derive every number and parity claim from the two libraries' source instead of trusting the new wording.

**Why:** the toast-sonner draft (2026-10-31, round 2) fixed the test-file list but still had: an exit duration the library cuts short, a parity claim ("Esc as today") that was narrower than the old code, an unqualified AC that its own Non-Goal contradicts, and a test inventory that missed a file. See [[ui-library-swap-spec-checks]] for round 1.

**How to apply:**
- A duration/animation AC: find the unmount timer next to the CSS. Sonner v2.0.8 `TIME_BEFORE_UNMOUNT = 200` removes the toast 200 ms into a 400 ms transition (non-front collapsed: transform 500 / opacity 200), so "exits in 400 ms" is false.
- Esc "as today": Radix `DismissableLayer` adds a capture keydown listener on `document` for the highest layer, and the toast's `onEscapeKeyDown` closes it when the target is NOT in a toast. So today Esc closes the newest toast with focus anywhere, and a toast shown after a Sheet opened outranks the Sheet. An AC "Esc closes the toast that has focus" is narrower.
- Pause on blur: Radix viewport pauses on `window` blur / resumes on focus; Sonner pauses only on `document.hidden`.
- Focus on close: Radix `handleClose` moves focus to the viewport when focus was inside the toast; nothing in a Sonner-based AC list says where focus goes.
- Same title, two call sites: `rg 'title: "X"'` before trusting an AC phrased as "the X toast" (here "Copiato con successo" is both `TableActions` with a Chiudi action and `InputWithCopy` with the normal X).
- Negative assertions go vacuous: `expect(queryByRole("status")).not.toBeInTheDocument()` detected Radix's announce node; Sonner's live region has no `role`, so the assertion can never fail. `rg 'queryByRole\("status"\)' ` in tests that mount the Toaster.
- Test inventory: also grep tests importing the old component directly (`from "../toast"`), not only those mounting `<Toaster />`.
- Other specs' ACs that pin the thing being changed (pagina-analisi AC8 "toast transitions stay as they are", design-system-web Non-Goal "Animazioni nuove", AC23 "stessi elementi" vs new icons): `rg -n -i toast brain/specs` and compare each hit with the new ACs, not only the DS ACs the spec cites.
- Round 3: an AC "key X does what the library does, with nothing added" must be traced through the library's handler. Sonner's Esc runs `setExpanded(false)`, which collapses the stack (non-front children get opacity 0) and is one of the pause conditions. That clashes with "a focused toast is fully visible" and "time stops while focus is inside". Also check items the library hides but leaves tabbable: Sonner's `data-visible=false` sets opacity 0 but keeps `tabIndex=0`, which clashes with "max N visible" vs "focused or close button visible on Tab". And a "closes only by A, B or C" list must include the link and swipe paths that other ACs and the Non-Goals keep.
- Round 4 (rule "no handler of ours over the library, AC X the only exception"): walk every AC for code it silently needs. Ctrl/Cmd-click "closes the toast as today" was Radix `ToastClose` (composeEventHandlers), so it needs our handler; a link press with a modal open needs the same pointer-events/outside-dismiss code as the excepted AC. Also grep the library for state resets on count changes: Sonner `if (toasts.length <= 1) setExpanded(false)` resumes timers under a still pointer or after F8 when a close leaves one toast, which breaks "time stopped while hovered / after F8" ACs. Compare "same moment of disappearance" claims with the old queue limit (`TOAST_LIMIT = 1` removed the old toast at once). The live region reads the close button's aria-label too (Sonner renders it before the content; Radix excluded it with `data-radix-toast-announce-exclude`).
- Installed radix in a worktree may be absent for the app: read the lockfile version (`pnpm-lock.yaml`) and the root `node_modules/.pnpm` copy of the same version, and say so.
