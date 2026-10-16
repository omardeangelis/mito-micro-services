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

Related: [[vacuous-test-patterns]]
