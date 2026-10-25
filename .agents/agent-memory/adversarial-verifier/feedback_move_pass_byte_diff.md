---
name: move-pass-byte-diff
description: How to settle "the moved program is kept exactly" for a code move into a service: byte-diff the moved body, diff every collaborator, then check the driver by hand
metadata:
  type: feedback
---

For "function X moved from the router to a service, unchanged":
- Pull the same line range out of base and head with `sed -n '/^<start anchor>/,/^<end anchor>/p'` and `diff` the two. Only the export line should differ; this settles every inner rule (lock order, cases, writes) at once.
- `git diff base HEAD --` on each collaborator it calls (effect/db, errors translator, helper services). An empty diff means the edge mapping and the lock helper are unchanged too.
- The driver (forEach, transaction wrapper, options, the Set built from input) is the part that gets rewritten: compare it line by line, and check that the adapter spread `{...input, actor}` passes the same fields as before (zod strips extra keys, `.default` makes the field required).
- `git diff --stat base HEAD -- <test dirs>` shows the old test files are untouched, which is the "assertions unchanged" evidence.
- Running `pnpm exec eslint <file>` directly in a worktree can fail with a plugin conflict ("remove the plugins setting"). That is the environment, not the change; use `next lint` for the gate.

Mutants matter less here: when the body is byte-identical, the tests only have to show that the wiring works.

Related: [[api-surface-caller-and-gate-reconcile]], [[refactor-spec-ac-checks]]
