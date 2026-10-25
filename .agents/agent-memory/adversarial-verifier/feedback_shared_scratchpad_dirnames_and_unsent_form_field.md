---
name: shared-scratchpad-dirnames-and-unsent-form-field
description: Generic names (orig, clone) in a shared scratchpad get deleted or reused by parallel passes; fixtures that omit a form field leave its pick-drop mutant alive
metadata:
  type: feedback
---

A mutant runner crashed mid-run because `<scratchpad>/orig/` (my pristine copies) was removed by a parallel pass; the clone was left with a mutant applied and the next restore failed. Use a pass-unique folder name (`v3orig`) and re-verify the clone against `git show HEAD:<file> | cmp` after any runner error.

A related-customer fixture without `vatCode` let the "drop vatCode from the zod pick" mutant survive (silent loss of the Partita Iva field), while 7 other picked columns died. For a whitelist-by-pick input, diff the fixture's keys against the picked keys and the form's keys; each key missing from the fixture is a surviving drop-mutant. A one-off probe with the form-shaped payload (vat-only, other fields undefined) proves the real code persists it.

**Why:** the review round claimed "no form column lost" from reading the pick, not from a test.

**How to apply:** run one drop-key mutant per picked key; list survivors as "persistence unpinned", not as data loss, unless a probe shows the value is dropped. Related: [[shared-worktree-git-archive-copy]].
