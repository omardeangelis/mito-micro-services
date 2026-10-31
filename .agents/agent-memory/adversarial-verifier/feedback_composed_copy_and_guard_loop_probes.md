---
name: composed-copy-and-guard-loop-probes
description: Render the composed string (value + caption) for every KPI kind, and probe role-change guards with a lagging /me to catch refetch storms
metadata:
  type: feedback
---

Two checks that found real defects where the suite was green:

1. **Composed copy.** When a component prints `format(value) + " " + caption`, build that
   string for every builder kind (tsx/vitest probe that logs `tab.textContent` for each tab).
   One builder put the count inside its caption too: «350 350 chiamate · 65% con risposta».
   Tests pinned other kinds' captions («9 sedi») but not the AC's own example string.
   Also log the "—" note for the case where the *window* has no data and the comparison does:
   a single `if (cmp === null || cur === null)` branch printed «Il confronto non ha dati»
   when the comparison had data.

2. **Role-change guard loops.** A guard that on a 403 invalidates `/me` and `removeQueries`
   the old role's keys re-creates those queries on the next render while the store still has
   the old role. Probe: render with store role ADMIN, server role OPERATORE, and `/me` that keeps
   saying ADMIN (or fails); wrap the fake backend's read array `push` to log counts with
   timestamps. Found ~120 requests/s, the selected chart loading forever. Do not `await` a
   setTimeout in that probe without a long test timeout: the loop starves timers.

3. **Clamped captions (line-clamp-N).** jsdom can't see a cut. Dump the real component's
   `outerHTML` from a vitest probe (`writeFileSync`, console is silenced), inject it into any
   page of the running Vite dev server (its Tailwind CSS has every scanned class; the login
   page works without auth), and compare `scrollHeight / lineHeight` with the clamp, in the
   strip and column widths and at root 20px. A "wraps to two lines now" fix still cut
   «10,7% 9 / appuntamenti su 84 / risposte» next to a 64px sparkline at every value. A
   string fixture test (`${format(kpi)} ${caption}` rebuilt in the test) proves nothing here.
   Also compare the loading skeleton's number-row height with the ready row when an optional
   note line (AC12 «—» note) renders: +18px shift.

**Why:** green suites assert one representative kind and the happy role flip only.
**How to apply:** any KPI/tab/caption composition, any "403 means role changed" guard, any
`line-clamp`/`truncate` on composed copy, any "skeleton as tall as the ready state" claim.
Related: [[out-of-tree-vitest-probe]].
