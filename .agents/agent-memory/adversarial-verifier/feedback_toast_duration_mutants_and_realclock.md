---
name: feedback-toast-duration-mutants-and-realclock
description: Per-call-site duration mutants (x -> 3x) find untested toast durations; real-clock lower-bound helpers flake under load
metadata:
  type: feedback
---

For "every toast keeps its duration" ACs, mutate each `duration:` literal (perl on that line, restore from a copy, cmp) and run only the call site's folder: sites sharing a value with a tested site (1 s, 2 s error twin, 5 s vs the default) survive, and "same code as the tested twin" is not coverage.

A real-clock `expectToastLasts` that takes `shownAt` after `findByText` and asserts `elapsed >= ms` against the node GONE (exit 200 ms included) fails when the toast was created >200 ms before `shownAt`: seen "expected 7963 >= 8000" with three suites in parallel (load ~125), 1 of 3 runs.

Sonner store: `toast.dismiss()` after `cleanup()` kills toasts already created; one created after afterEach stays active and is replayed to the next Toaster (Observer.subscribe).

**How to apply:** run the 3-suite parallel stress only after the normal runs are green; report flake rate, not just pass.
