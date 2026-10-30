---
name: lockfile-reresolve-baseline
description: How to judge a pnpm lockfile change: frozen check proves only specifier consistency; compare non-frozen re-resolves of HEAD and of the working tree, not the committed lock
metadata:
  type: feedback
---

A frozen check (`pnpm install --frozen-lockfile --lockfile-only` in a manifest-only scratch copy, with the `vendor/` tarballs that `file:` deps need) only proves the importers' specifiers match the lock. It does not prove the lock has no stray churn.

For churn, run a non-frozen `pnpm install --lockfile-only --ignore-scripts` on two scratch copies, HEAD manifests plus HEAD lock and working manifests plus working lock, then diff the two re-resolved outputs. Diffing the re-resolved output against the committed lock mixes in the resolver's own rewrites: in this repo HEAD alone churns `zod` peers (4.6.7 to 3.25.76 in the better-auth adapters and `@hookform/resolvers`), so that diff looks like the change's churn when it is not.

Integrity check without network tools: `npm view <pkg>@<ver> dist.integrity` (macOS has no `timeout`; run it without one). Compare with the `integrity:` of the lock entry.

Shell trap: in zsh an `echo "==LOCK"` or `echo ===X` unquoted label fails with "=... not found"; quote every label.

**Why:** design-system-web lockfile review (2026-10-29); the artifact's own diff was clean (3 entries, 1 importer), and the baseline diff proved zero extra churn once the inherited `zod` lines were set aside.

**How to apply:** any review of a `pnpm-lock.yaml` change. Run the HEAD baseline in the same scratch setup before attributing any rewritten line to the change. Related: [[root-tsc-untracked-js]].
