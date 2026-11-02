---
name: feedback_state_invariant_matrix
description: How to check a spec that defines states + an invariant (e.g. "state X iff open future alert"): build the action x state matrix, read the "does NOT close/change" lists, and replay data conversions twice
metadata:
  type: feedback
---

For specs with a state machine and an invariant, build the full action x start-state matrix and check each cell against the invariant. The contradictions hide in:
- "X, Y and Z do not close it" lists (a selector change that leaves an alert open on a terminal state broke the invariant and the homes);
- rules keyed on the *state* where the invariant is keyed on the *data* (e.g. "on a contact in Richiamo stay Richiamo" vs "alert is future") — check the exception windows (nightly job skipped, job time budget exhausted);
- rejection tables without a precedence order, when two rejection cases always co-occur (a dependent spec may need one specific case to win);
- data conversions with "first matching rule wins" where rule 1 is about another entity (alerts) — it swallows the contact; and "re-runnable" claims — replay the rules on states the new system itself produces.

- on a second pass, after a precedence order is added: replay every worked example in other ACs ("per esempio perché un collega…") against the new order — the example can now hit an earlier case; and check every rejection row against every action, not only the ones it was written for (a "future alert not confirmed" row literally rejected the outcome that needs no confirmation);
- "summary" claims added by a fix ("quindi lo Storico non la mostra", "gli altri criteri restano validi", "il filtro trova anche…") — test each against the other ACs and against the cited source's numbering.

**Why:** found all of these in one draft spec (esiti-richiami-stati, 2026-11-02); none were visible reading AC by AC.
**How to apply:** any quality-gate on a spec with states, transitions, a nightly job, or a data migration.
