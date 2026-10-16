---
name: memo-and-order-probes
description: A React.memo wrapper and a "fallback order" branch can both be removed with the suite still green; prove them with a render counter in the mocked hook and a three-item list, not with the existing assertions
metadata:
  type: feedback
---

Mutants that drop `memo(...)` or flip the order of a fallback list (nearest previous vs farthest) survived a 100-test suite in the notes-chat review. The existing assertions only checked outcomes (focus lands on a trash), not how often a row renders or which of two candidates is chosen.

**Why:** the suite had one previous-note case (two notes total), so "nearest" and "farthest" were the same trash. Memo had no test at all.

**How to apply:** when a review asks "does memo still work", add a counter to the mocked hook the row calls (e.g. `useQuery: () => (mocks.renders++, {...})`), type into an unrelated field, and assert the delta is 0. Confirm the counter moves by removing the memo first (it must report >0), otherwise the 0 proves nothing. For a fallback order, use at least three items and make the expected candidate differ from the farthest one. Related: [[feedback_vacuous_test_patterns]].
