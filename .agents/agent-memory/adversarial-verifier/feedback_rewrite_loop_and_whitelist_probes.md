---
name: rewrite-loop-and-whitelist-probes
description: Code-level probes for "saved link opens ignoring removed params, no URL rewrite loop" and for allow-lists built on a side-channel property (drizzle uniqueName); which mutants survive
metadata:
  type: feedback
---

Second look at PR6 Clienti (implemented, not planned). The plan-stage traps in [[removed-params-focus-handoff-gates]] were all closed in code; these checks settled it without a browser:

- **Rewrite-loop probe.** Mock `next/navigation` with a STATEFUL router: `push` does `history.pushState` and notifies listeners, `useSearchParams` re-reads `window.location.search`. Mount the table with each stale URL (`order_by=priority`, `contattato&page=3`, `name,priority`, stale `filter_by`/`filter`, empty `order_by=`, made-up name), `rerender` 5 times with new `data`, assert exactly one push (StrictMode: 2, dev only). Also read `node_modules/next/dist/client/components/app-router.js`: `appRouter` is a `useMemo` on `[dispatch, navigate]`, so `useRouter()` is stable across navigations and an effect keyed on `router` cannot loop. The committed test only had a mocked `push` and a single mount.
- **Allow-list built on a side channel.** `createSQLQuery(filters, map, getTableName(customers))` keeps a filter only if `map.get(name).uniqueName` includes the table name. The committed test sampled `comune` only. Probe every map column (`uniqueName` is `<table>_<col>_unique` for all 8) and the removed/hostile names (`state`, `closed_at`, `constructor`, `__proto__`, `toString` all give ""). Without this, one column with a custom `.unique("x")` would silently lose its filter.
- **Revert-the-fix run.** Put the base version of the changed component (`git show <base>:path`) in the scratch worktree and run the new test file: 7 of 8 popover tests failed, so the tests are not vacuous. Then probe VALID entries on the sibling consumer (Pratiche enum/date/number rows) to prove the shared-component change dropped nothing.
- **Survivors of a 23-mutant battery (all test gaps, none a defect):** multi-value `order_by` with a removed id (`name,priority`): server `.split(",")` and `.some`, client `.every`; client `c.id === id` match; the "only if focus is lost" guard of the focus handoff. A mutant that forces the handoff flag true on every error is equivalent (the link is absent then).
- **A test named for an AC can prove less than its title.** The page test "no state/priority/alert controls (AC65)" only asserts `CustomerCreateContact` is absent; a re-added task manager would pass. The real guards were deleted files plus `tsc`.

**Why:** the plan said "no loop" and "whitelist drops removed names" and the tests shown covered one input each.
**How to apply:** for any "ignore stale URL/preference" change, run the stateful-router probe, the per-entry allow-list probe, and the revert-the-fix run before judging; classify survivors as test gaps unless the unguarded branch is reachable from the real UI (here `toggleSorting(desc)` without the multi flag makes multi-sort links hand-made only).
