---
name: client-mutation-checks
description: How to check React client mutation flows (react-query v4 per-call callbacks, transition-based waits) without a component test
metadata:
  type: feedback
---

- **Per-call `mutate(vars, { onSuccess, onError })` callbacks do not run if the component unmounted before the answer** (react-query v4 `MutationObserver.notify` guards on `hasListeners()`; hook-level `useMutation({ onError })` options still run). For any "toast on rejection / refresh after save" claim, ask what happens when the container (Sheet, route, row) closes mid-save. Source to cite: `@tanstack/query-core/build/lib/mutationObserver.js` `notify`.
- A plan that says "verified in the browser" for hook logic leaves no regression test: grep `_test/` for the hook and consumer names before accepting "covered".
- Writing a probe test outside the repo root fails (vite fs deny); read the library source instead of fighting it.
- Fix pattern `mutateAsync(...).then(ok, err)` is sound in rq v4.36 (`mutateAsync` = observer.mutate, settles after unmount) and `useTransition`'s `startTransition` still runs its callback on an unmounted component in React 18.3 (Next 14.2 `router.refresh` dispatches from the root, so it works). A test that mocks only `useRouter` and keeps the real `useRefreshAfterSave` proves this; check that the test mocks the router, not the hook. Then count which consumers the unmount test covers vs. which were changed (often 2 of 5).
- **`mutateAsync` cuts both ways: a success handler that navigates still runs after the user left.** In the Contatti detail, a reopening resolved after the Sheet was closed still called `router.replace(newDetail)` (probe: render, choose, `unmount()`, resolve, assert on the router mock). Next's app router dispatches globally, so the closed Sheet reopens and the replace lands on the list's history entry ("Indietro" leads to the superseded page). For every success path that navigates, probe unmount-then-resolve and ask whether the navigation should be skipped.
- **Optional options of a shared hook:** when a feedback hook takes an optional option (e.g. `activeContactHref`), grep every consumer for it; a test that rejects with the payload that skips the branch (`activeTaskId: null`) hides the consumers that never pass it (3 of 5 here).

Related: [[vacuous-test-patterns]]
