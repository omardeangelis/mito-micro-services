---
name: spec-from-prototype-checks
description: Checks that found real defects when gating a SPEC.md written from an approved prototype plus UX/UI reviews, or one that moves criteria out of another spec
metadata:
  type: feedback
---

Checks that paid off on a spec built from a prototype (assegnazione-wave, 2026-11-03):

- **Every placeholder needs a real data source.** Prototype fixtures carry fields the real schema lacks (a human "name" next to `file_name`). Map each `<nome>`/`<quando>` in the copy to a stored field.
- **Default vs allowed range.** When a criterion gives a default value (date picker starting at today+14) and a separate restriction (only after the current deadline), test them together on an ordinary state.
- **Two criteria on the same race.** Search for every criterion that handles "data changed between preview and confirm" (abort vs skip). They often contradict each other, and then no implementation can pass both tests.
- **Moved criteria.** When a spec takes ACs/definitions from another spec, grep for references to the moved ids ("la regola di AC15 di X") and check whether criteria that stay behind depend on moved definitions. Also check whether the source spec has actually been amended.
- **Same word, two counts.** Compare labels across screens of the same page (e.g. "Lavorati" with and without Richiamo, "attivo" meaning non-disabled vs calling).
- **New writes the prototype faked.** A save that the spec adds (deadline saved on «Avanti») usually has no failure, uncertain or denied outcome. The reviews never saw it because the prototype didn't write.

**Why:** these were the defects that made the spec impossible to implement as written. Checking rubric structure alone (fold-in of reviews) passed.
**How to apply:** run these after the rubric checklist on any create-spec gate that has a prototype behind it.
