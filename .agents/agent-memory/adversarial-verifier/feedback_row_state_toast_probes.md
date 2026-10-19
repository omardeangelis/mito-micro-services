---
name: row-state-toast-probes
description: How to check a table-row mutation cell (toast type/duration/action, unmount settle, portal click bubbling); mocks of useToast hide the whole toast pipeline; mutant values that collide with fixtures; equivalent mutants in a wait hook
metadata:
  type: feedback
---

- **A suite that mocks `useToast` proves only the options object.** `type: "background"`, `duration`, and `ToastAction asChild` never reach Radix there (mutants dropping `asChild`, adding `variant: "destructive"`, or an action on non-reopen toasts all survived). Probe with the real `Toaster` + real `next/link` inside `AppRouterContext.Provider` (`next/dist/shared/lib/app-router-context.shared-runtime`), `vi.useFakeTimers()` after the user interaction, then read `[role=status][aria-live]` (background = `polite`, foreground = `assertive`), `li[data-state]` at 4800/5200 and 7800/8200 ms, and click the anchor to see `push`. The `TOAST_LIMIT = 1` reducer replaces the open toast: a second `toast()` removes the earlier action anchor (probe shows it).
- **Row click bubbling:** Radix menu/Dialog portals bubble React clicks to the row `onClick`. The only guard is the cell `stopPropagation`; removing it survived 183 tests. Probe with the real table and a `push` spy: pick a menu item, press Annulla/Cambia stato, assert `push` not called; and a read-only cell click still calls it (mutant "stop always" survives too).
- **Success-after-unmount vs rejection-after-unmount are two tests.** A `mutate(vars, {onSuccess,onError})` mutant dies only on the rejection test; a success callback guarded by `if (!cellRef.current) return` survived. Ask for both, plus a reopen variant.
- **Mutant value collides with a fixture:** a "wrong target state" mutant used the same state the test picks and "survived"; pick a value no test uses before calling a survivor real (re-run showed it killed).
- **Equivalent mutants:** in `useSavingUntilRefreshed`, `pending = saving || refreshing`, so `fail(); refresh()` in place of `finishAfterRefresh()` keeps the spinner through a suspended refresh (probe with a `Suspense` gate that throws a promise in the transition: pending stays true). They differ only in the `settle` (focus) callback.
- **Announcement by id membership:** `left = !contacts.some(c => c.id === saved.id)` says "non è più nell'elenco" for a row that moved page (sort by a column the save changes) or was replaced by its reopening (new task id, same customer, same total). Probe with a harness whose refresh swaps the ids.

Related: [[feedback_client_mutation_checks]], [[feedback_vacuous_test_patterns]], [[feedback_mutant_battery_scratch_copy]]
