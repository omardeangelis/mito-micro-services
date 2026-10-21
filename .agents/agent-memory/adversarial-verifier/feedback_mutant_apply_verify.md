---
name: mutant-apply-verify
description: Confirm a mutant edit really changed the file (exactly once) before reading a test run; and check Next server-action ordering from dist before claiming a race
metadata:
  type: feedback
---

A multi-line perl or sed regex can silently match nothing. The first mutant run in the notes review passed 75 tests on unmutated code. Always `grep -c` the removed snippet (expect 0) before running, and restore from a saved copy after.

A Node apply script that requires exactly one match (exit if `split(from).length - 1 !== 1`) catches the opposite trap too: a pattern anchored on 4 leading spaces also matches the same line at 6-space indent in a sibling function (same `findWorkingOperator` call in `handover` and `assignCustomers`). Add the next line as context to disambiguate.

Race claims about server actions: Next 14.2.5 chains server actions and router refreshes through one queue (`node_modules/next/dist/shared/lib/router/action-queue.js`, `dispatchAction` / `runAction`). Read that before arguing two actions can answer out of order.

**Why:** A false green from an unapplied mutant would have made the reappearance guard look untested or tested by accident.

**How to apply:** Mutant check = grep count before, test run, restore, diff against the repo file.
