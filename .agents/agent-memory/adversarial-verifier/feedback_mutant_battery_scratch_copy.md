---
name: mutant-battery-scratch-copy
description: Run a whole mutant battery in a scratch copy of src (rsync --delete, perl -0pi, cmp check, per-mutant log) so the repo is never touched; reuse the header of the test file for probes
metadata:
  type: feedback
---

A 16-mutant battery on a UI component ran in about 8 minutes from one bash loop: `rsync -a --delete <repo>/src/ <copy>/src/`, one `perl -0pi -e` substitution per line of a mutants file, `cmp` against the repo file to prove it applied, `vitest run <dir>`, then the unique FAIL lines per mutant. The repo's working tree was never edited, and `cmp` after the last restore confirmed it.

**Why:** the repo rule is "keep a copy, restore at once"; a scratch copy with a symlinked `node_modules` removes the risk of a failed restore leaking into the repo (see [[feedback_mutant_harness_hygiene]]). Copying `.env*` was avoided on purpose: the notes suite runs without them.

**How to apply:** `rsync -a --exclude node_modules --exclude .git --exclude brain --exclude '.env*' ./ <copy>/`, then `ln -sfn <repo>/node_modules <copy>/node_modules`. For probes, concatenate the first ~160 lines of the test file (mocks and helpers) with the probe body, so the probe reuses the real mocks. Zsh: `timeout` is not installed; use `pnpm exec vitest` directly.

**Harness pitfalls seen later (same battery style):** (1) a summary regex like `/Tests\s+(.*)/` matches the wrong line in vitest output (the separator lines), so a survivor looked like "101 passed" in the summary while its FAIL list was empty; read the FAIL lines, and re-run a suspected survivor by hand with the exact `vitest run` line. (2) A runner filter by name needs the full mutant name, not a prefix; a short name silently runs nothing. (3) BSD `sed -i` needs an extension argument: `sed -i 's/…/…/' file` treats the script as the backup suffix and fails; use `perl -pi -e` instead.
