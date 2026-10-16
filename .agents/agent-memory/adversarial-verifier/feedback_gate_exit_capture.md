---
name: gate-exit-capture
description: How to capture gate exit codes and verify server-action bundling in this zsh repo; empty PIPESTATUS and the action manifest format are traps
metadata:
  type: feedback
---

When running gates through the Bash tool (zsh shell), do not read exit codes from `${PIPESTATUS[0]}` after a pipe: zsh uses `pipestatus`, so the variable prints empty and looks like a pass with no evidence. Run the gate with output redirected to a log file, then `echo EXIT=$?` on its own, and tail the log.

Also, a `grep --include=*.ts` glob fails in zsh with "no matches found" unless the call is wrapped in `bash -c` or the pattern is quoted.

To prove a `"use server"` module is registered as a server action after `next build`, do not grep `.next/server/server-reference-manifest.json` for file names. It is keyed by action hash and maps to page workers only. Instead, grep the export names (for example `createChatAction`) across `.next/server`, which keeps them in the server bundle, and confirm the action hashes are referenced from both the page's server bundle and a client chunk.

**Why:** In the PR4 gate run the first tsc and lint exit codes came back empty because of the zsh pipe, and the first manifest grep returned nothing although the actions were present. Both looked like failures or passes without evidence.

**How to apply:** Any time a gate is run in this repo through zsh, redirect to a log and read `$?` directly. Use the export-name grep for action bundling checks. Also note that a running `next dev` (not started by the verifier) rewrites top-level `.next/*.json` manifests in the repo, so manifest mtimes do not prove a gate wrote them.
