---
name: review-at-reviewed-commit
description: When judging a documented exception or ledger entry, read it at the reviewed commit (git show <sha>:path), not the working tree, which can hold uncommitted fixes
metadata:
  type: feedback
---

Judge a documented exception (ledger entry, decision note) at the reviewed commit with `git show <sha>:<path>`. Do not read the working-tree copy. A fix that exists only as an uncommitted edit is not a resolution of the finding in the commit under review.

**Why:** In a motion-craft pass on commit 1b50ace, the ledger line that covered the shared Select and DropdownMenu motion gap existed only in the working tree (git status showed it modified). The committed ledger lacked it, so the project's exemption did not apply to the reviewed diff. Reading the working tree would have wrongly marked the prior finding as resolved.

**How to apply:** For each prior finding claimed as fixed, run `git --no-pager show <sha>:<path> | grep ...` and compare with `git diff <sha> -- <path>`. Report uncommitted differences as a separate note, and do not count them toward the verdict. Also check that the exemption's stated scope covers the surface (name-by-name), not only its general wording.

**Addendum (review of b5ac1a7):** to run the reviewed commit's gates without touching the repo, `git archive <sha> | tar -x -C <scratchpad>/rev` and symlink `node_modules`, then run vitest/tsc/next lint there. Probes and mutants go in that copy only. `git cat-file -p <sha>:<path>` avoids `git show` pitfalls with unusual paths.
