---
name: mocked-framework-side-effects
description: When a plan's failure path calls a framework navigation API (router.refresh etc.) that jsdom tests mock, read the framework source for what it does when the network/build is the thing that failed
metadata:
  type: feedback
---

Component tests that mock `next/navigation` (`router.refresh: vi.fn()`) pass vacuously on failure-path behavior: they only prove the call happens, not what it does. In Next 14.2, `router.refresh()` falls back to a hard browser navigation when the RSC fetch throws (offline), returns non-RSC/non-OK (proxy error page), or carries a different buildId (after a deploy) — see `client/components/router-reducer/fetch-server-response.js` (catch → `[url, undefined]`, `doMpaNavigation`) and `app-router.js` (`pushRef.mpaNavigation` → `location.replace`). Any client state restored in the same handler (e.g. a draft put back in a textarea) is wiped.

**Why:** found while reviewing a plan that restored an unsent note and then called `router.refresh()` "to show it if it was saved"; the planned unit tests could never catch it, the planned browser test (offline mode) would.

**How to apply:** for every side effect a plan schedules in an error path, ask "what does this call do when the same fault (network down, new deploy, error page) is still present?" and check the framework source under `node_modules`, not the docs.
