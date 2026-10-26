---
name: disabled-message-and-x64-runner
description: AC text "disattivato gets UNAUTHORIZED Utente disattivato" is only the middleware branch; over real HTTP the adapter drops the session first. Python mutant runner launches x64 node (rollup native missing)
metadata:
  type: feedback
---

**Disabled-user message.** `createTestCaller` builds the session by hand, so a disabled user reaches `resolveActor` and gets `UNAUTHORIZED` / `Utente disattivato`. Over both real transports (Hono `app.request` with a `sessions` row and `vi.unmock("@mito/server/auth")`, and Next's `getServerSession`) the NextAuth adapter's `getSessionAndUser` returns null for a disabled user, so `protectedProcedure` answers `UNAUTHORIZED` / `UNAUTHORIZED`. The message is reachable only when deactivation lands between context creation and the middleware. Report as a NIT on AC wording, not as a broken gate: the code is the same everywhere.

**How to apply:** for any authz charter, run one matrix (anon, no operator row, no-row ADMIN, disabled OPERATORE/ADMIN, active roles) over createTestCaller, `inProcessLink`, and the backend `app.request` with real session cookies (harness: `apps/api/src/_test/app.db.test.ts`), plus an input-injection row (`actor`, `operatorId`, `role` as extra keys). It took one 16 s probe file in a `git archive` copy.

**Runner pitfall:** `/opt/miniconda3/bin/python3` is x86_64, so a `subprocess` running `./node_modules/.bin/vitest` starts the universal node as x64 and dies with `Cannot find module @rollup/rollup-darwin-x64`. Every mutant then looks "killed" (exit 1, no Tests line). Launch `["/usr/bin/arch","-arm64","/usr/local/bin/node","./node_modules/vitest/vitest.mjs", ...]`, and treat a missing `Tests` summary line as a harness error. Related: [[mutant-battery-scratch-copy]], [[authz-read-surface-probes]], [[three-transport-contract-differential]].
