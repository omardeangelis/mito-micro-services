---
name: shared-primitive-regression-checks
description: How to check a change to a shared UI primitive (Dialog etc.) against its consumers - twMerge consumer classes, re-implemented Radix focus rules, live harness, mock stream format detail
metadata:
  type: feedback
---

When a base class changes (e.g. `sm:space-x-2` -> `gap-2`), run `twMerge(base, consumerClass)` in node for every consumer's className: a consumer patch written for the old base (`gap-2 sm:gap-0`) can silently zero the spacing (found: two footers with buttons touching at >=640). Then measure the boxes live.

A wrapper that re-implements Radix FocusScope's mount focus with a selector + single `.focus()` loses three things Radix does: the loop that tries the next candidate when focus() fails (display:none, visibility:hidden, disabled-fieldset children -> focus stays on the trigger outside the modal), the X as last-resort candidate (now the container), and `select()` on inputs. Prove it with an in-page harness that runs both rules on the same fragments with an outside button focused first; disclose it is a harness.

**Why:** unit tests in jsdom cannot see focus failing on hidden elements; consumer grep must include which consumers are actually mounted (one was commented out).
**How to apply:** for any primitive change, list consumers + mount points, twMerge each className, run the harness, and check content narrowing (e.g. new 2rem inset) against header controls with an X-intersection probe at 280-400 px.

Mock detail for [[ui-pass-mock-trpc-responses]]: the first line is the JSON object WITHOUT its final closing brace, then newline + `}`. A full JSON.stringify + "\n}" gives a generic failure toast instead of the dialog.
Also: after Escape, Radix Presence can keep the closed content (and overlay) for >1 s in agent-browser; check `[role=dialog]` count is 0 before clicking the next trigger.

Second-round lesson (loop wrapper): a fix that loops candidates and stops when `document.activeElement === el` is still wrong. Radix stops when activeElement differs from the element focused BEFORE the loop. A delegating candidate (Radix Tabs/RovingFocus list, tabIndex 0, which forwards focus to the active tab; items start at tabIndex -1) makes the `===` loop skip past the forwarded target: ExportDialog landed on the 3rd control instead of the tab. Live reference without rebuilding the base: a capture-phase `document.addEventListener('focusScope.autoFocusOnMount', h, true)` runs before the wrapper; `preventDefault` there and run Radix's rule (TreeWalker, removeLinks, X last) to get the "before" landing on the same DOM. Also log focusin/focusout during open to see the bounce.
Also emulate the base layout by swapping classes on the open node (w-full, no pr-6, X appended with right-4 top-4) to tell a pre-existing overflow from one the change widened.
