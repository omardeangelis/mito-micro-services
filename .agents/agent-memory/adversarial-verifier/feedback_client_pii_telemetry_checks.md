---
name: client-pii-telemetry-checks
description: Where personal data leaks past a "masked" client: Sentry Replay maskAttributes default, tRPC loggerLink input, Sentry URL/Referer; probes that proved each without a browser
metadata:
  type: feedback
---

Three client/server leak paths were provable from node_modules alone, with no browser session:

1. **Sentry Replay `maskAllText: true` does not mask attributes.** Only keys in `maskAttributes` (default `['title','placeholder']`) are starred; `aria-label`, `alt`, `data-*` (Radix Toast `altText` becomes `data-radix-toast-announce-alt`) are recorded in clear. Probe: slice the `maskAttribute` function out of `node_modules/.pnpm/@sentry-internal+replay@<v>/.../build/npm/cjs/index.js` (about lines 9088-9116, grep `function maskAttribute`) into a scratch `.js` with a fake `el`, call it with `key="aria-label"` and the name; output showed the name unmasked while `title` came out as stars. Grep the base commit for `aria-label={\`...${name}` first: a new aria-label carrying a customer value is a NEW leak, not a pre-existing pattern.
2. **tRPC `loggerLink` in a server `api` proxy logs `input` on error even in production** when `enabled` is `op.direction==="down" && op.result instanceof Error`. Probe: replicate the link config in a scratch `.mjs` (createRequire from the repo package.json) with a terminal link that calls `observer.error(TRPCClientError.from({error:{...}}))`; the printed object held `input: { customerQuery: '...' }`. A search text that rides an RSC `api.x.query(input)` therefore reaches Vercel runtime logs on any failure.
3. **Sentry browser events carry `location.href` (with the query string) and `Referer = document.referrer`** (`httpContextIntegration`); `trpcMiddleware` attaches RPC input only if `sendDefaultPii` (grep it: unset here, so the input is not sent).

**Why:** a "search text in the URL is accepted" note covers history and request logs only; the three paths above leave the origin or write to function logs, and none is named in tech-debt.

**How to apply:** for any pass on personal data, (a) read `sentry.client.config.ts` for Replay options and diff the default `maskAttributes` against every attribute the change puts a name/phone/fiscal code in; (b) read `src/trpc/server.ts` and `src/trpc/react.tsx` logger options; (c) check Next's prefetch skip (`walk-tree-with-flight-router-state.js` `shouldSkipComponentTree`: a prefetch of a route with no `loading.tsx` renders layouts only), so a missing `prefetch={false}` on such a link is not a PII finding. Link a `rrweb` claim to line 801 (`transformAttribute` runs for every attribute).
