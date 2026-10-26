---
name: gate-clone-and-doc-count-scope
description: Build gates from a clean clone of HEAD, not the scratch gate worktree (it can carry probe edits); check doc counts under the scope the doc names
metadata:
  type: feedback
---

When a charter says "run api:build in the scratch gate worktree", first check `git status` and `git log -1` there. A scratch gate can sit several commits behind HEAD and carry an uncommitted probe edit (seen: a `selectDistinct` to `select` change left in a service file). Building it proves nothing about HEAD.

Instead: `cp -cR <clean repo>/. <mktemp>/tree` (APFS clone, cheap, keeps pnpm's relative links), then run `pnpm --dir <tree> api:build` and `api:smoke`. Note `timeout` is not on macOS. The repo itself may have tracked memory-file edits; they do not affect the bundle.

Counts in docs (e.g. "server-only in 32 files") depend on the scope: `git grep -lE '^import "server-only"' <rev> -- packages` gave 32 while the repo-wide count (minus brain) gave 34. Compute the count under each candidate scope before calling a doc number wrong, and flag an unstated scope as MINOR, not as a false count.

**Why:** a build of a mutated tree reads as a pass for HEAD; a count check under the wrong scope wrongly fails a correct number.
**How to apply:** before any api:build run, record the gate's HEAD and dirty files in the report; before calling a doc count false, run it under each scope the doc might mean.
