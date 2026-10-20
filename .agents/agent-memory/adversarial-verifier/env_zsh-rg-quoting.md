---
name: env-zsh-rg-quoting
description: In this shell rg is a zsh function and unquoted globs like --include=*.ts abort the command; use rg -g with quotes
metadata:
  type: feedback
---

The Bash tool runs zsh. An unquoted `--include=*.ts` fails with "no matches found" and the whole command dies silently. `rg` is a shell function wrapping the Claude binary; it works, but prints its own definition when `which rg` is run. Use `rg -n "pattern" src -g '!node_modules' -g '!*test*'` with quoted globs, and keep each probe a separate small command.

**Why:** lost one round of greps in the PR6 plan review to this.

**How to apply:** quote every glob; prefer `rg -g` over `grep -r --include`.
