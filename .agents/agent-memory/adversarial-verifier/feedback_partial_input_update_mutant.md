---
name: feedback-partial-input-update-mutant
description: Update-write characterization tests that send every column hide "omitted field written as NULL" mutants; always mutate with a subset input
metadata:
  type: feedback
---

A write test that passes ALL writable fields (and a pg twin that asserts only 1-2 fields with toMatchObject) cannot tell `.set(input)` (undefined keys skipped) from `.set({...input, email: input.email ?? null})`. Probed on customer.updateCustomerFromDashboard: mutant survived writes.db (7/7) and writes.pg (6/6) and the older toMatchObject tests.

**Why:** the real caller (form + cleanObject) sends subsets, and an Effect refactor that maps fields explicitly is exactly where the omitted-vs-null semantic flips.

**How to apply:** for any update procedure, run one mutant that nulls an omitted optional column; if it survives, ask for a subset-input case asserted as a full row (expectWritten-style), not toMatchObject. Also check precedence chains for the pair that no test combines (tempID vs vatCode-only).

Scratch-worktree reuse: other reviewers leave `wt-*`/`gate` worktrees in the shared scratchpad; remove only your own `mktemp` one.
