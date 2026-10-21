---
name: invariant-trigger-coverage-mutants
description: How to judge a test-only deferred invariant trigger (e.g. "same operator") that runs every writer: actor = owner and aligned-only fixtures hide mutants
metadata:
  type: feedback
---

When a test file installs a deferred invariant trigger and runs "every writer" through it:

- **Prove the trigger, not the after-assert, kills.** Grep the mutant run log for the trigger's message ("operator rule: …"); an `expectAligned` after the call kills the same mutants, so a green rule file can be the after-assert's work.
- **Actor = owner hides actor-vs-owner mutants.** If every call is made by the customer's own operator, a writer that assigns the new row to `actor.operatorId` instead of the customer's passes. Mutate `operatorId: <owner>` -> `actor.operatorId` in each creating writer; see which file kills it.
- **Aligned-only fixtures skip the repair variants.** A deferred trigger installed after seeding lets a split fixture be seeded; if the rule file seeds only aligned pairs, a "skip the already-on-target customer" mutant survives it. Check the kill comes from another file before rating it MINOR.
- **Enumerate writers with aliases.** `import { task as tasks }`, `customersSchema`: grep the alias imports too, then each `.set(` for the invariant's columns.

Related: [[mutant-battery-scratch-copy]], [[vacuous-test-patterns]]
