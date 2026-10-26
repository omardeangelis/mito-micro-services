---
name: round-history-per-commit-probes
description: How to verify a "rounds in separate commits, red test first" claim: parent-source overlay for red, tsc per commit for type tests and staged-rename leaks, equal timestamps mean history rebuilt after the fact
metadata:
  type: feedback
---

Checks that worked on a characterize -> refactor -> fix branch (analytics-effect):

- **Red-first is not visible in git when test and fix share a commit.** Re-run it: `git archive F` copy, overlay the PARENT's version of every non-test source file the commit touched (M/D restore, A delete; treat `_test/`, `*.test.ts(x)`, `src/test/` as test), run the commit's changed test files. Read the failure messages: a rename commit makes everything red for the trivial reason (caller key gone), so also mutate one behaviour back inside the real commit (e.g. `adminProcedure` -> `protectedProcedure`) and see the guard tests fail for the right reason.
- **Type tests (`expectTypeOf`) are never red under vitest.** They pass at runtime against any source; prove red with `tsc --noEmit` in the overlay copy.
- **Equal commit timestamps (4 commits at 13:06:06, 3 at 13:12:36) mean the history was split after a wave ended.** Run `tsc --noEmit` plus the targeted vitest dirs on EVERY commit, not only the ends. A `git mv` staged for a later task leaked into an earlier commit (store file renamed, importer not): 2 commits failed tsc and an unrelated test file at load.
- **A late "refactor" commit after the fixes** breaks "rounds in order" even if no assertion line changed; check the notes list it under Deviations, not only in a summary line.
- **Characterization strength:** run a 30+ mutant battery on the refactored code against the round-1 tests (window start/end swaps, join removal, actor filter dropped, guard swaps, default timeFrame). Then add "empty result" mutants: a list endpoint returning a sentinel row when empty survived because no test seeds zero rows.
- Python on PATH was x86_64 (miniconda); wrap the child commands with `arch -arm64`, not the interpreter (`arch -arm64 python3` fails: Bad CPU type). zsh does not word-split `$batch` in `for c in $batch`: use `bash -c`.

Second pass on the same branch (history already rewritten, all commits clean):
- **"History rewritten with commit-tree" claims are checkable**: the old hashes stay in the object store and `git reflog`. `git rev-parse old^{tree}` vs new for each pair, and `git diff --stat old new` on the differing ones, proves "same tree except the store rename". Do it before trusting the notes' old-to-new map; also look for pairs the map omits.
- **Behavior-preserving refactor proof stronger than mutants**: a seeded-PRNG probe vitest file dropped into two `git archive` copies (parent and child), dumping every caller x input x procedure (errors included) to JSON, then `==`. Works for the round-2 move (base vs end) and for a refactor sitting after the fixes. Keep seeded dates >=0.15 day from window edges, strip `windows`/Date fields. Run it next to a mutant battery: the battery found the empty-result sentinel gap, the probe proved nothing actually changed.
- **Mutant harness label bug**: a vitest load error prints `Tests  no tests`, not `N failed`. Classify SURVIVED only if `Test Files` has no `failed`; otherwise LOADERR. A `z.string() as unknown as X.default(...)` mutant had wrong precedence and was reported as survived until re-run by hand.
- **Full suite per commit under load** (my batch plus another session's vitest): 2 of 20 commits failed one unrelated file with a 5000ms timeout or a debounce spy. Re-run that commit alone and idle before calling the commit red; report it as a load flake, not a finding.
- **Tests-only "guard" commit that the notes say "starts from a red test"**: there is no code to be red against. Prove its worth by applying the review's mutants to the commit BEFORE it (tests miss all) and AT it (tests kill them). The notes' wording is then a MINOR over-claim, not a gap.
- **Rome/UTC time-zone test**: mutate the formatter (drop `timeZone`) and run both projects; it must fail in `utc` and pass in `rome`.

**Why:** the claims "tests green on the base", "refactor changes no assertion", "each fix starts red" are all checkable by execution, and each had a gap that reading the diff alone would not show.
**How to apply:** any review of a multi-round branch with commit-level promises.

Related: [[feedback_mutant_battery_scratch_copy]], [[feedback_refactor_spec_ac_checks]], [[feedback_shared_worktree_git_archive_copy]]
