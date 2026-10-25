---
name: feedback-mutant-first-match-and-empty-input-case
description: perl s/// without /g hits the FIRST of repeated .pick({; a "pick+field" battery then kills for the wrong reason; empty-id BAD_REQUEST cases pass without min(1)
metadata:
  type: feedback
---

Two traps from a zod-input battery (createPratica, round "correzioni di TD9").

1. **First-match mutant.** `perl -0pi -e 's/(\.pick\(\{\n)/.../'` edits the first `.pick({` in the file, which was the practice schema, not the related-customers one. "pick+operatorId" "died" (wrong schema) and "pick+chatId" "survived" (not applied). **Why:** results looked like a real kill/survivor pattern. **How to apply:** anchor on the next line (`\.pick\(\{\n\s*name: true,`), print `sed -n` of the mutated region and `cmp` against HEAD before trusting any result; redo the whole column when one row looks odd.
2. **Equivalent override.** Adding `operatorId` to a pick survives legitimately when the service spreads the input first and sets `operatorId` after (`{...customer, fileName, operatorId}`). Check the order of the spread before calling a survivor a gap.
3. **Empty-id case.** A test `{ customerId: "" } -> BAD_REQUEST` does not pin `.min(1)`: without it the DB path gives BAD_REQUEST too (CustomerMissing). Pin the cause/message (not CUSTOMER_NOT_FOUND) or the mutant survives. Same for the related `id`.
4. **ANALYZE in a pg test** was not load-bearing (mutant died without it at 8 rows); harmless, and per-file DBs mean no leak.
5. A sibling verifier mutated files in the shared worktree during my run (git status showed foreign diffs). Gate and mutants only in a private `git archive HEAD` + `cp -c -R node_modules` copy with a unique dir name (`clone` was reused by someone else).
