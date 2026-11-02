---
name: async-focus-and-sticky-message-probes
description: Spec gate checks for late rounds - async focus moves vs a focus-trapping popover opened from another independent part, post-failure messages whose duration ignores foreign rereads, fences scoped to one reread, refusal loops on a hidden selected item, locale digits in a number field, sibling write modes with asymmetric "exactly the preview" clauses
metadata:
  type: feedback
---

After several text-only rounds a spec with an action popover still hid these; each needs a concrete reachable timeline:

- **Focus on data arrival ("after Riprova focus goes to the title / back to Riprova").** Parts load independently, so while part A reloads the user can open a focus-trapping popover from part B. A's arrival then pulls focus out of the trap. Ask for "only if focus is still on body / where it was".
- **Post-failure summary texts with "lasts until the next edit or next confirm".** A reread that is not the user's (an earlier action's late outcome) can make the preview invalid while the sticky text keeps the confirm "active" with a label that needs a valid preview. Durations must also end, or re-evaluate, on any reread.
- **Two rules that both fire on the same auto-close** ("a reread not from its confirm closes without toast" vs "after a failed confirm it closes on its own, with the outcome toast" vs "a late answer rereads silently"). Build the matrix: who triggered the reread x was there a failed confirm before.
- **"No write after the reread starts" fences.** Check every other read the uncertain-outcome text sends the user to (a toast "check the numbers in the home" read after leaving the page): the fence only covers the popover reread.
- **Refusal "receiver no longer in the team" + "the popover stays open with the choices".** The departed person has no row, so cannot be unticked: literal reading loops refusal -> reread -> active confirm -> refusal.
- **Number field + thousands dots in the UI** ("su 3.900"): "1.500" is 1500 to an Italian admin and 1.5 to a parser; also "-5" when the invalid list says "empty, 0, non-integer, over max".
- **Two write modes, one says "receivers get exactly Cambia", the other does not**: the silent one lets the server recompute with fresh loads, so preview and outcome differ with none of the listed refusal cases firing.

**Why:** home-admin gate round 8 (2026-11-02) found all of these after seven rounds.
**How to apply:** any spec with an action popover, independent loading parts and an uncertain outcome. Related: [[review-fold-feasibility-checks]], [[retry-timeout-and-global-toast-checks]], [[created-first-order-and-uncertain-reread]].
