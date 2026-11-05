---
name: toast-silencing-sibling-queries
description: A fix that silences one query's toast leaves siblings under the same invalidated key; how to enumerate and prove it, plus mutant-runner env traps
metadata:
  type: feedback
---

When a "one notice only" finding is fixed by `meta.toastErrors: false` on one query, list every active query the failing mutation invalidates (grep the `onSettled` keys, then the hooks mounted on that screen). The fix tested only the query whose fake could fail: the sibling had no failure switch in the fake, so the green test proved nothing about an outage. Probe: in a scratch copy, make the sibling handler honour the same failure flag and rerun the same test; print the toast texts.

**Why:** in a real 5xx every read fails together, so a test that fails one read is a narrower world than the bug.

**How to apply:** any "single notice" AC. Also, `refetch().then(isSuccess)` announcements die when another path runs `cancelQueries` during the read: hold both requests and check the status region. Check a negative for each announce (failed retry says nothing): `if (isSuccess)` mutant survived.

Runner: Python subprocess needs `/usr/bin/arch -arm64 node_modules/.bin/vitest` (see [[feedback_disabled_message_and_x64_runner]]); `--reporter=json --outputFile`; console output needs `--silent=false --disable-console-intercept`.
