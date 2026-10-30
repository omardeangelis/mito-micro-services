---
name: web-role-change-probe
description: How to probe an apps/web role-change/cache-purge guard out of tree - standalone vitest config, mutable auth layer, gate /me by URL, read counters miss 403s
metadata:
  type: feedback
---

To check "admin numbers vanish at once when the role drops" in apps/web, run a probe from the scratchpad, never in the tree:

- Config: a standalone `vitest.config.ts` in scratch (react plugin, `root: apps/web`, alias `@` -> `apps/web/src`, `server.fs.strict: false`, jsdom, `setupFiles` absolute) plus `node_modules` symlinked to `apps/web/node_modules`. Importing `apps/web/vite.config.ts` from scratch fails (tailwind plugin default-export interop); `--dir <scratch>` with the app config fails on fs.allow.
- Auth: a `Layer.succeed(Authenticated)` whose `CurrentUser.role` reads a mutable `server.role`, and `fakeMe` with a getter on `state.role`. To hold `/me`, gate on `HttpServerRequest.url` inside the middleware: the second arg's `endpoint.name` logged "HttpApiEndpoint", not the endpoint name.
- Fake read counters (`branchReads`, `callsReads`) are in handlers, after `AdminOnly`: a 403 never increments them. Log the middleware URLs instead.
- Trigger the refetch with `focusManager.setFocused(false); setFocused(true)` or a navigate to a URL the page really reads (check `writeState` param names first; a wrong param is a no-op trigger).
- Sample `document.body.textContent` for other operators' names and the cache keys at t+0/20/50/100 ms, with `/me` held and after release.

**Why:** the repo's AC23 tests either open with the server already demoted (admin numbers never shown) or use a toy component; only the held-`/me` page probe shows what is on screen between the 403 and the role update.

**How to apply:** any client guard that purges cache on a 403 or role change. Related: [[real-handler-client-probe]], [[out-of-tree-vitest-probe]].
