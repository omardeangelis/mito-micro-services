---
name: shuffle-noise-filter
description: Running vitest --sequence.shuffle on a test-conversion PR: triage failures against the diff file list and base before reporting order dependence
metadata:
  type: feedback
---

A full-suite `--sequence.shuffle.tests --sequence.shuffle.files` run fails on files the PR never touched (sequential-by-design files like migrate.pg.test.ts, seed tests, a 5 s timeout under load). Only report a failure as a regression if the file is in the diff AND `git show origin/dev:<file>` is not order-dependent too.

**How to apply:** (1) list changed test files (`git diff base...HEAD --name-only --diff-filter=AM`), (2) rerun only those with 2+ seeds (vitest 5: `--sequence.shuffle.tests --sequence.shuffle.files --sequence.seed=N`), pg files with the TEST_DATABASE_URL, (3) run each file alone in a loop, (4) for failures in changed files read the base version: a test that applies migration N then expects 0 pending on the next test is order-dependent in base too (not a finding).
