---
name: test-runner-upgrade-checks
description: How to verify "tests run as before" across a test-runner major upgrade (vitest etc.) beyond a per-file probe
metadata:
  type: feedback
---

A per-file probe (env, TZ, pool, fake timers at setup load) passing with identical lists is not enough to prove a runner upgrade keeps semantics.

**Why:** in a vitest 1 -> 5 review the probe matched while `sequence.hooks` silently went `parallel` -> `stack`; the probe only sampled state at setup-file load and never saw hook order, mock reset points, or repeated `useFakeTimers` calls. Also, a stated "N tests fail without option X" was wrong (actual 26, not 7): re-run such counts instead of trusting them.

**How to apply:**
- Diff the *resolved* per-project config of both versions programmatically (`createVitest(...).projects[i].config` from each version's `node_modules`), with `cacheDir` pointed at the scratchpad. That shows every changed default at once.
- For mock lifecycle, add a scratch setup file (via a scratch config that imports the repo config and appends it to each project's setupFiles) that wraps `vi.fn`/`restoreAllMocks`/`useFakeTimers` and logs leaks. Always include a positive-control test file that must trigger each event, or a zero-event result proves nothing.
- Check whether the default you suspect is load-bearing by re-running the suite with the old value pinned in a scratch config.
- zsh: `echo =====` fails (equals expansion), so use `echo "-----"`.
