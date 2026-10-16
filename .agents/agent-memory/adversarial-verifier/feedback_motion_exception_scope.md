---
name: motion-exception-scope
description: Motion exceptions and tech-debt gaps are scoped to the consumers they name; class-only test guards miss descendants; "verified in browser" claims need a probe record
metadata:
  type: feedback
---

- Check a documented motion exception by the consumer it names (component, file, or "PR3 uses X for Y"), not by the primitive's file line. A ledger line naming one consumer of a shared primitive does not cover another new consumer of it in the same diff.
- A guard that asserts on an element's own className does not see its descendants. Before flagging a descendant's transition (a badge inside a menu option), check whether it can change visibly (a badge whose colors never change on highlight is inert).
- A report cell that says "verified in the browser" needs a matching probe record in the notes. Grep the notes for the probe term (getAnimations, prefers-reduced-motion, emulate) before accepting the claim.

**Why:** Motion-craft pass on commit 4fae91b (2026-10-15). The Select ledger line named only PR3's priority Select; the handover dialog's Select was a second new consumer of the same primitive. The reduced-motion spinner claim in REPORT had no recorded probe in the implementation notes.

**How to apply:** When judging a motion ledger entry, a deferral, or a class-string guard in a PR review. Read the entry at the reviewed commit and list the new consumers of the primitive in the diff.

Related: [[review-at-reviewed-commit]], [[vacuous-test-patterns]]
