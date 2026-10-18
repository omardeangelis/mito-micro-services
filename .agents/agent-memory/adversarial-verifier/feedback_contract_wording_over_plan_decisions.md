---
name: contract-wording-over-plan-decisions
description: A test that encodes a browser quirk or a plan decision can lock in a miss of the SPEC acceptance wording; check the AC text, not the test name, before accepting it as proof
metadata:
  type: feedback
---

When a focus or announcement test is named after a browser or a plan decision ("Safari, il focus non si sposta"), it can assert the miss rather than catch it. In the notes-deletion review (round v2) the test for "a click that gives the trash no focus" asserted that focus stays on `body` after the drop, while AC78 says the focus "passa al cestino della nota accanto" without a condition. The mutant that always records focus failed only that test, so the guard was the sole cause of the difference.

**Why:** the plan (T4.7) had turned the spec's unconditional focus rule into "only if the focus stayed on the trash"; the implementation followed the plan, and the test followed the implementation. Nothing checked the plan's wording against the AC. The contract is SPEC.md; the plan and the REPORT are evidence of intent, not the bar.

**How to apply:** for each focus, announcement or wait criterion, quote the AC sentence and check every condition the code adds (activeElement, chat on screen, `last` of several) against it. A condition that is not in the AC is a finding even when the plan documents it; ask for the AC to be updated or the code to drop the condition. Also probe a branch by removing its primary target (a fallback like `trash ?? field`): the mutant that drops the fallback survived 101 tests until a probe with only foreign notes left killed it.
