---
name: test-conversion-kill-parity
description: How to prove a mechanical test conversion (Promise -> it.effect / forkChild) kept guard tests effective - same production mutants on base and head worktrees, compare failing-test sets; sentinel probes for .each cells
metadata:
  type: feedback
---

For a review of converted tests (no production change), run the SAME perl mutant on a base worktree and a head worktree and compare the set of failing `fullName`s from the vitest JSON reporter, not just "it failed". Equal sets per mutant is the evidence; a head-only survivor is the finding.

**Why:** a conversion can keep a test green yet weaken it (wrong `.each` row value, a fork that never starts, a branch that no longer runs). Kill-set parity catches all three at once.

**How to apply:**
- One mutant per `.each` row (e.g. a no-op of the failpoint helper a row uses, or a guard narrowed to one branch) shows each row gets its own value.
- To prove a cell's result reaches the assertion, wrap it as `(cell ?? "sentinel")`. Writing `"sentinel" ?? cell` short-circuits: the call never runs and you get a lock-wait timeout instead of a value mismatch.
- pg race files cascade (later tests time out in `beforeEach` on leftover locks): read the first failure, or isolate with `-t`.
- A mutant that survives the charter files may be covered by an unchanged file. Run it on that file before calling it a gap.
