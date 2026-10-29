---
name: root-tsc-untracked-js
description: Root `tsc --noEmit` type-checks every **/*.js in the tree; an untracked plain-JS script outside apps/web fails the root lint gate while the reviewed diff is clean
metadata:
  type: feedback
---

The root `tsconfig.json` includes `**/*.js` and excludes only node_modules, apps/api/dist and apps/web; the shared base sets `checkJs: true` and `strict`. So any `.js` file anywhere in the tree (including an untracked spec helper under `brain/`) is type-checked by the root lint gate, and implicit-any parameters in a browser-eval script fail it.

**Why:** design-system-web review (2026-10-29): the reviewed diff (apps/web + lockfile) was clean, root `tsc --noEmit` exited 2 with 6 TS7006 errors, all in an untracked `brain/specs/crm/design-system-web/baseline/capture.js`. HEAD in a `git archive` copy exited 0, and HEAD plus only that file reproduced the 6 errors, which isolated the cause.

**How to apply:** when a root gate is red on a diff that does not touch root files, first run `git ls-files --others --exclude-standard` and list the untracked `.js`/`.cjs`/`.mjs` outside apps/web. Attribute by copying the one file into a HEAD archive (`git archive HEAD | tar -x`, symlink node_modules) and rerunning the gate. Report the working-tree state, not only the diff, because the branch commit can pick the file up. Related: [[worktree-gate-substitutes]], [[lockfile-reresolve-baseline]].
