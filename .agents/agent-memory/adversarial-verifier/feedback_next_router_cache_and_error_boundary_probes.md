---
name: next-router-cache-and-error-boundary-probes
description: Read-only browser probes for Next 14.2 App Router history/caching claims - stale list after a mutation with no refresh, dead error.tsx reset, server-error trigger via an invalid session cookie
metadata:
  type: feedback
---

Three probes that turned plan claims ("Back skips the old item", "Riprova retries") into measured findings without any DB write:

1. **Count RSC fetches, not just pushes** (extends [[feedback_router_cache_stale_seed]]). `performance.clearResourceTimings()` before the action, then `performance.getEntriesByType("resource").filter(e => e.name.includes("_rsc"))` after. A Back (restore) never refetches in Next 14.2, at any age; a push within 30 s of the target's last use reuses the router cache. So a mutation path that navigates with `replace` and no `router.refresh()` leaves the previous page stale for Back and for a quick close. Run a control on a sibling path that does refresh (`refresh-reducer.js` sets `prefetchCache = new Map()` and rebuilds the cache tree) to show the difference.
2. **Drive the mutation's success branch with a mocked tRPC body** (stream format, see [[feedback_ui_pass_mock_trpc_responses]]). Before clicking, verify the route with a harmless `fetch("/api/trpc/<proc>?batch=1&input=%7B%7D")` (GET on a mutation is rejected by a real server, so it is a safe check). Afterwards re-read the rows to prove nothing was saved.
3. **Trigger a server error without code changes:** with no auth middleware, `agent-browser cookies set next-auth.session-token invalid-probe ...` then a soft navigation makes the Server Component's procedure throw UNAUTHORIZED and lands in `error.tsx`. Restore the cookie, click the retry: in 14.2 `reset()` only clears the boundary state (`error-boundary.js`), re-renders the cached errored flight chunk and sends no request; the boundary also stays up across same-pathname navigations (it resets on pathname change only). The fix to ask for is `startTransition(() => { router.refresh(); reset() })`.

**Why:** the plan and jsdom tests only checked that `replace`/`reset` were called; the browser showed the user-visible effect.

**How to apply:** for any "after X, Back/close shows Y" or "retry" claim, measure fetches and the rendered rows, not just URL and history length. A toast with an 8 s duration must be clicked in the same bash call that triggers it. A list stuck on its skeleton once on the shared dev server was not reproducible in 3 reruns: rerun before filing.
