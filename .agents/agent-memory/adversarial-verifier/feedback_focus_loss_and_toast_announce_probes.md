---
name: focus-loss-and-toast-announce-probes
description: How to hunt "focus never on body" violations (controls that unmount on activation, history Back) and why a toast inside a Radix modal is still announced; DOM-only toast injection via the webpack runtime
metadata:
  type: feedback
---

**Focus-on-body hunt.** The planned focus rules usually cover the designed paths (open, close, modal, row leaves). The misses are controls that render conditionally and vanish when activated: pagination "Precedente" on going to page 1, "Successiva" on going to the last page, a removable filter chip, empty-state actions ("Azzera filtri", "Vai alla prima pagina"), "not found" links. Keyboard-activate each in the browser and `eval` `document.activeElement` after the navigation settles. Also try browser Back out of a route-based Sheet: a return-focus value written only in the shell's `close()` is never written on Back.

**Why:** in the PR5b focus pass (2026-10-18) every designed path passed, and five list controls plus Back still ended on `body`; the tests covered none of them.

**Toast inside a modal Dialog/Sheet.** Radix Toast speaks through `ToastAnnounce`, a new `role=status` node portaled into `body` when the toast appears. `aria-hidden`'s `hideOthers` (1.2.4) runs once when the Dialog opens and has no MutationObserver, so that node is NOT hidden. Only the viewport (visible toast and its action) is. A probe that checks the viewport for an `aria-hidden` ancestor wrongly concludes that toasts are silent. Any extra in-Sheet repeat then announces the message twice.

**How to apply:** inject a toast with no server call: `webpackChunk_N_E.push([[Symbol()],{},r=>req=r])`, then `req("(app-pages-browser)/./src/components/ui/use-toast.ts").toast({...})` (dev build module id). Use a MutationObserver to log every `[aria-live]` node, with its hidden-ancestor flag and parent. Radix removes the announce node after 1 s, so read it from the observer log and not afterwards.

Harness: `agent-browser wait --url "**/x*"` hung for more than 120 s on URLs with a query string. Use `wait --fn 'location.pathname.endsWith(...)'`. Mutants as JSON exact-substring replacements, applied by a small node runner (count must be 1), avoid perl escaping.

Related: [[feedback_live_region_and_class_checks]], [[feedback_ui_pass_mock_trpc_responses]], [[feedback_mutant_battery_scratch_copy]]
