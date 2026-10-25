---
name: order-by-removal-survivors
description: Removing ORDER BY survives when fixture ids sort like the expected order (GROUP BY emits id order) and on tiny DISTINCT tables (PGlite plans sort-unique); also unmatched-key fallthrough mutants
metadata:
  type: feedback
---

Characterization of customer list queries: `getCustomerUnderReview` without `.orderBy` and with `.orderBy(customers.id)` both stayed green, because the two fixture ids ("cliente-blacklisted" < "cliente-review") sort in the same order as the expected updatedAt order and GROUP BY customers.id emits id order. `.orderBy(createdAt)` and `desc(updatedAt)` were killed, so the test pins direction but not the column. Likewise `selectDistinct ... .orderBy(x)` with the orderBy deleted survived for all 4 filter-option lists (5-row table: planner picks Sort+Unique, so output is sorted anyway).

**Why:** a "sorted output" assertion on a tiny table proves nothing about ORDER BY presence; the engine's incidental order equals the expected one.

**How to apply:** for each ordered query run a delete-the-orderBy mutant and an order-by-id mutant; ask for ids that sort opposite to the expected order (or 3+ rows), and for DISTINCT lists a pg-project test with enough rows (hash aggregate) or a toSQL check. Also try an "unmatched primary key falls through to the next key" mutant for precedence chains (tempID with no match + fiscalCode): the tests that only use a matching tempID cannot see it.
