---
name: mutant-harness-hygiene
description: Mutant runs in a copied repo leak between runs unless the source is re-synced first; a failed restore step silently contaminates the next result.
metadata:
  type: feedback
---

A mutant runner that restores the mutated file with a wrong path (`src/src/...`) leaves the previous mutant in place, so later runs report failures that belong to an earlier mutant (seen: a create-chat mutant showed up in the results of a delete-chat mutant).

**Why:** the first run in this review reported failures in tests unrelated to the mutated file. The cause was the restore step, not the code under test.

**How to apply:** before each mutant, re-sync the whole `src/` of the copy from the original (`rsync -a --delete <repo>/src/ <copy>/src/`), apply one substitution, check with `cmp` that it applied, then run the tests. Check the mutant log for its own failure names before reporting a kill. Never run `sed -i` on macOS without a suffix argument; use `perl -0pi -e`.

Related: [[feedback_lock_order_mutants]]
