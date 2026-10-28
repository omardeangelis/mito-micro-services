---
name: env-zsh-rg-quoting
description: In this shell rg is a zsh function and unquoted globs like --include=*.ts abort the command; use rg -g with quotes
metadata:
  type: feedback
---

The Bash tool runs zsh. An unquoted `--include=*.ts` fails with "no matches found" and the whole command dies silently. `rg` is a shell function wrapping the Claude binary; it works, but prints its own definition when `which rg` is run. Use `rg -n "pattern" src -g '!node_modules' -g '!*test*'` with quoted globs, and keep each probe a separate small command.

**Why:** lost one round of greps in the PR6 plan review to this.

**How to apply:** quote every glob; prefer `rg -g` over `grep -r --include`.

Also: `git show $r:src/...` breaks in zsh, because `:s` is a history modifier on `$r` ("ambiguous argument origin/dev/db/..."). Write `"${r}:src/..."`. `rg` skips dot-folders such as `.github`: add `--hidden`. There is no `timeout` command on this Mac.

zsh does not word-split an unquoted `$FILES`: `vitest --run $(for f in $FILES; do [ -e $f ] && echo $f; done)` passes no file and runs the whole suite (lost ~10 min under load 100). Put the list in a file and loop in a `#!/bin/bash` script (macOS bash 3.2: no `mapfile`, use `while read`). Under heavy load, db tests die on "Hook timed out in 10000ms"; `--hookTimeout` on the CLI does not reach the vitest projects, so raise `hookTimeout`/`testTimeout` in the scratch copy's `vitest.config.ts` and use `--maxWorkers=4`.
