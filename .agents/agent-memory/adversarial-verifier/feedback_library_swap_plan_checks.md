---
name: library-swap-plan-checks
description: Plan-stage checks for a UI library swap that mounts old and new containers side by side in a shared test harness (Radix Toast -> Sonner)
metadata:
  type: feedback
---

When a swap plan mounts the new container in the shared test harness "next to the old one so every task stays green", grep the tests for unnamed and same-named role queries before trusting it.

**Why:** in the toast-sonner plan (2026-10-31) T1 added Sonner's `<section aria-label aria-live>` to `renderWithApi`. A jsdom probe (`@testing-library/dom` queryAllByRole) showed a `section` with aria-label counts as `region`, so an existing `getByRole("region")` (ImportStatus.test) throws on two matches, and the old and new containers carried the same name ("Notifiche (F8)"), so the next task's named query also broke. See [[ui-library-swap-spec-checks]], [[library-swap-spec-round2-checks]].

**How to apply:**
- `rg 'ByRole\("region"\)|ByRole\("status"\)|ByRole\("list"\)'` in tests that use the shared harness; compare with the new library's DOM (role from tag + aria-label).
- Check name collisions between old and new containers during the coexistence window.
- Delayed removal (Sonner: dismiss -> rAF -> 200 ms unmount; create -> setTimeout(0)) makes "the toast stays" and "no toast" assertions pass vacuously unless the test waits past the delay; ask for a mutant/negative control.
- A plan validation that reads CSS-block variables or :focus-visible rings "on the element" in jsdom is infeasible: the project precedent is reading globals.css as text (tokens.test.ts).
- user-event's pointer-events check walks ancestors' computed style; a Tailwind class is not applied in jsdom, so with a modal open (body inline pointer-events:none) a click on an outside overlay throws unless `pointerEventsCheck: 0`, which makes the pointer-events half untestable there.
- ESLint flat config: a later config object's `no-restricted-imports` replaces earlier options for matching files; a new ban must be added to every object.
- Prefer the library's own option when it already does the behaviour (Sonner `action: {label, onClick}` closes by itself) over a React element plus our dismiss handler, under a "no handler of ours over the library" rule.
