---
name: storage-draft-checks
description: How to break client drafts persisted in sessionStorage/localStorage (failed-send recovery) and which test claims survive mutation
metadata:
  type: feedback
---

- **Probe the remount-before-answer race:** unmount mid-send, mount a new instance BEFORE the action settles, then settle with a failure and type in the new instance. A "follow the draft once it exists" onChange overwrites the failed text the new instance never showed. Unmount-then-settle-then-remount tests miss it.
- **"Restore in an effect, not in render (hydration)"** is never proven by RTL `render` (no hydration): a useState-initializer mutation passes. Needs `renderToString` + `hydrateRoot` to be real.
- **"Draft only once one exists"** is often untested: mutate the guard to `if (true)` and see if anything goes red.
- **Pending-key vs DB-id collision** never fails a test (React only warns on duplicate keys); check by mutating the key to a small number.
- Probe method that works: temp `_test/zzprobe.test.tsx` copying the real file's mock header, `console.log` outcomes, delete after; mutate with a scratchpad backup and confirm with `shasum` before/after.

Related: [[vacuous-test-patterns]] [[client-mutation-checks]]

Added after the PR4 AC76 re-review:
- **Probe "own success clears a draft adopted mid-send":** chat A sends, closes; chat B opens, sends its own note; A fails (B adopts A's text); B succeeds and its unconditional `save(null)` wipes the shared key while the field still shows A's text. Next 14 server actions run one at a time in the router action queue (`shared/lib/router/action-queue.js`), so A's answer always lands before B's: this order is the default, not a fluke.
- **Mutate every "wait until loaded" guard** (e.g. `if (operatorId === undefined) return` before reading a draft): when the query has no SSR hydration the guard is what keeps the draft across reloads, and tests that mount with the operator already loaded never notice it gone.
- Python mutation runner (`python3 -I script.py`, replace-once, run the test file, copy the backup back, compare shasum at the end) handles ~20 mutants in one call; a mutant that does not compile shows up as "no tests", not as killed.

Added after the PR4 AC76 v1 charter review:
- **Combine branches the tests exercise separately:** "submit before the operator loads" x "a stored draft that turns out to be a colleague's" left the field text with the alert, no draft and no follow (lost on reload). Cross every early-return of the submit path with every branch of the adopt path.
- **Resend-of-a-draft x remount mid-send:** the remount instance adopts the in-flight text; when the closed instance settles it writes the shared key blindly (failure -> duplicated text "D\nDZ", success -> key cleared while the open chat still shows text with the alert). The fresh-send variant may be guarded (adopt counter) while the resend one is not.
- **Alert that survives emptying the field** makes the "shown with alert => survives reload" invariant false for new text: check what clears the failed flag besides a send.
- Mutating the adopt callback to read state (`content`) instead of the ref only fails if a test types in the open chat BEFORE the event-driven adopt; check that such a test exists.

Added after the PR4 AC76 store-based (useSyncExternalStore) review:
- **Submit an EMPTY field** through every failure path (refused before the operator loads, action failing). If the failed flag is set without text, the alert shows on an empty field and the next text you type, never sent, keeps the flag, becomes a draft and survives a reload. Look for `failed: true` set without `&& !!text`.
- **Sign-out clear x in-flight send:** clear storage and memory, then settle the old send as failed. The settle recreates the copy with `operatorId: null`, and the next operator in the tab adopts it, because ownerless copies are accepted. Clearing the store doesn't cancel sends that are still in flight.
- **Probe logging:** `console.log` of text with "\n" breaks `grep PROBE` lines and fakes a lost-text bug. Always `JSON.stringify` the values you log.
- Render-time filter plus an effect that prunes the same list mask each other under mutation. Removing the render filter leaves a one-frame duplicate ("flash") that RTL never sees.
