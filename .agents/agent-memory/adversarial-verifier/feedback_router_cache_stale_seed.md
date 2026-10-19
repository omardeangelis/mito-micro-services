---
name: router-cache-stale-seed
description: useState seeded from a server prop goes stale when the page remounts from Next 14.2 router cache (30 s dynamic); prove with the network log and a 36 s control; fetch-mock pitfalls in agent-browser
metadata:
  type: feedback
---

A client component that does `useState(() => propFromServer)` and saves the user's change with a plain `fetch` (no `router.refresh()`) shows the OLD value when the user leaves the route and comes back by `router.push` within about 30 s: Next 14.2 (no `staleTimes` in `next.config.js`) serves the cached RSC payload for a dynamic page, the component remounts, and the seed is the stale prop. Seen on the Contatti "Colonne" menu: hide Telefono, open a contact (separate route), close it, Telefono is back.

**Why:** unit tests mount once, so none covers unmount/remount; the plan's browser run reloaded the page instead of returning from the detail.

**How to apply:** probe in the browser: do the action with a fetch mock that returns 200 (no write to the shared DB), navigate away and back with a `history.pushState` hook, then `agent-browser network requests --filter _rsc`. No `_rsc` request for the list URL on return = cached payload. Control: wait 36 s and repeat; a request now fires. Fix to ask for: `router.refresh()` after an OK response (purges the router cache), not a store read.

**Mock pitfalls (agent-browser eval):** (1) a `window.fetch` wrapper written as `typeof u==="string"?u:u.url` throws on a `URL` object, so Next's RSC fetch fails and the app falls back to a hard document load (the Network log shows a `Document` request and the marker variable on `window` is lost); use `String(u instanceof Request ? u.url : u)` and keep a `window.__marker` to prove the navigation stayed client-side. (2) `fetch` resolves on HTTP 500; an `.catch(console.error)` never runs, so mock a 500 `Response` to show the silent failure. (3) A click sent right after Escape on a Radix menu can be swallowed (body `pointer-events:none` for a moment); wait before clicking.

**Mutant lesson (same pass):** a stopPropagation guard on a cell whose child is mocked in the parent's tests (`vi.mock("../ContactRowState")`) survives; run the mutant against the wider folders (`src/app/dashboard/contatti src/components/custom/contact src/app/dashboard/customers`) before calling it a gap, and say so. Two stop handlers that cover the same click (menu content + each item) are mutually equivalent mutants: remove both at once to see whether any test guards the click at all.
