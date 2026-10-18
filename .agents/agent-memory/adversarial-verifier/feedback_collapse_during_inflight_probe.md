---
name: collapse-during-inflight-probe
description: Waits held in a child that a collapsible wrapper unmounts are lost on reopen; probe collapse/reopen while an action is in flight; mutants of wrapper keys survive suites that never change the id
metadata:
  type: feedback
---

For a wait state (spinner, aria-busy, disabled trash) held in a component that sits inside a collapsible content (Radix Accordion Content unmounts children when closed), collapse and reopen while the action is in flight, then check the wait and try a second click. The parent that owns the registry keeps its state; the child's local `useState` does not survive.

**Why:** in the notes chat review (T4.7, 2026-10-16), the deletion wait lived in `CustomerNote` inside `AccordionContent`: reopening showed the trash again and a second click sent a second delete. The suite was green because no test collapses mid-action.

**How to apply:**
- Probe: real `CustomerChatSection`, click the in-flight control, click the accordion trigger twice, assert the wait and the single call count.
- A `key` on a wrapper (e.g. `key={customerId}`) can survive the whole suite if no test rerenders with another id while a registry entry is open; probe it with a rerender that changes only the id.
- Mutant apply: write the pattern count assertion first (`count == 1`), as in the other mutant notes.
