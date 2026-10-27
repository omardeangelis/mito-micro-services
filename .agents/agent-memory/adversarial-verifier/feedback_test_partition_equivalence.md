---
name: test-partition-equivalence
description: How to prove a test-runner config change keeps the same files per project and the same test names; tool traps that fake a mismatch
metadata:
  type: feedback
---

To check "same tests per project" across a runner upgrade, use three independent sources and require all to agree:
1. `git archive <base>` and `<head>` into scratch dirs, then glob each with the OLD and NEW runner's own glob library and options (vitest 1: fast-glob `dot:true`; vitest 5: tinyglobby `dot:true, expandDirectories:false`), using the defaults copied from each version's `dist` (grep `defaultExclude =`).
2. The new runner's real listing: vitest 5 `vitest list --filesOnly --json=<file>` gives `projectName` per file (repeat with `--project X`). Never run `list` on vitest 1.6.
3. Any run evidence (JSON reports, probes): check file multiplicity per file against the config-derived partition; reports carry no project field, and probes in hooks miss fully skipped files.

**Why:** a caller-supplied compare script attributed projects only through a probe that skipped 3 files, and matched renamed titles with a lenient regex. Independent sources closed both gaps.

**How to apply:**
- Never pass a picomatch matcher straight to `Array.filter`: the index becomes its 2nd argument (`returnObject`) and every element after index 0 is "true". Use a lambda or `endsWith`.
- For `test.each` title changes, classify each test as exact / quote-only / truncation-only after a 1:1 pairing within the same file and status. A too-strict matcher reports false mismatches when only one side truncates; read the raw titles before calling a test lost.
- Check where the baseline run happened (`git reflog --date=iso` of that worktree vs the report mtime) and diff that commit against the base for test files and config.
See [[effect4-vitest5-upgrade-probes]].
