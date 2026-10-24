---
name: feedback-two-row-fixtures-and-id-order
description: Characterization tests whose fixture holds only the rows the query should return, or whose sort fixture is already in id order, let filter-removal and sort-column mutants survive
metadata:
  type: feedback
---

Customer router characterization (Drizzle to Effect): dropping the `inArray`/`where` of the two-step lookups (getAllPraticaByCustomer, getAllCustomerForPratica) survived because the DB held only the practices/customers that belong to the answer. Swapping 12 of 15 `orderColumn` cases for `customers.id` survived because the fixture ids ("cliente-completo" < "cliente-libero") sorted like the names; the test comment even claimed "l'ordine non dipende da pareggi".

**Why:** a fixture with no distractor row cannot tell "filtered" from "all rows"; an order fixture where the expected order equals id order cannot tell the sort column from the tie-break.

**How to apply:** for every filter mutant add "remove the where" and check a stranger row exists; for every sort test run "replace column with id" and check ids are in the opposite order of the key. Also mutate precedence of option flags (onlyMe vs operatore 0), `[]` filter arrays (drop `.length > 0`), and "unknown id" on writes that return the raw driver result (a typed CustomerMissing failure added by a rewrite survives). Python runner with exact (old,new) pairs on a throwaway HEAD worktree: write the mutant JSON inside the runner dir, not the cwd (it landed in the repo root once; moved at once).
