---
name: plan-verification-techniques
description: How to turn PLAUSIBLE plan claims into verified ones in this repo (PGlite probes, writer enumeration, UI data checks)
metadata:
  type: feedback
---

Techniques that paid off when reviewing PLAN.md designs:

- **Probe DB-internals designs with a scratch script.** A node script in the scratchpad that imports `<repo>/node_modules/@electric-sql/pglite/dist/index.js` runs real Postgres (PGlite 0.2.17 = PG 16.4) without touching the repo. Used to confirm `xmax/xmin = pg_current_xact_id()::xid` lock checks and deferred constraint triggers failing at COMMIT.
  **Why:** plan claims about PGlite behavior are otherwise only PLAUSIBLE. **How to apply:** any trigger/lock/commit-time design in a plan.
- **Enumerate writers before accepting "every mutation passes the guard or is admin".** grep `(insert|update|delete)\((task|alert|taskEventLog)` plus side-effect paths (customer form moving the contact, D5-style). Side effects in non-guarded procedures are where permission claims break.
- **Client-side read-only/permission UI needs data the list query selects.** Check the list query's `select` for the names the message shows (e.g., contact operator vs customer operator).
- **Check whether a "pause on a promise" concurrency test is feasible** without app hooks: services that own their `transaction` can't be wrapped; procedures run with a layer bound to a module that the global test setup mocks.

- **Instantiate each test case of a permission-gated action per role.** Combine the case ("customer already the target") with the role rule ("operator only on own customers"): it can reveal a self-targeting branch (operator takes a colleague's contact) that the ledger never recorded, and a UI that can't reach the branch the risk table relies on.
- **Ownership-acquiring actions vs divergent data.** When edit rights derive from "contact OR customer is mine", check every action that makes the customer yours (self-assign, handover target) against rows where contact operator != customer operator (e.g., unassigned customer + colleague's contact, which a realign migration may deliberately leave). A guard that checks only the customer row lets an operator take a colleague's contact. Also check the service itself enforces admin-only, not just the procedure middleware.
- **Check helper calls against depends_on, not only file lists.** A task calling a helper another task defines (e.g., `touchCustomer` in the guard task) with no edge and the same wave breaks parallel execution even when files don't overlap.
- **Ask where a modal is mounted when error handling refreshes the page.** If refresh flips a permission check that renders the trigger, "modal stays open, focus returns to the button" can't hold.

- **Cross-check a write-side date rule with the job that consumes the date.** A server rule that admits "today" for a deadline can be correct on its own and still useless downstream: a nightly cron that only acts on "due today" at its run time treats a today-deadline set after the run as an earlier day the next night. Compare the UI picker's minimum too (old pickers may be stricter than the new server rule).

- **tRPC error payloads: `createCaller` skips the `errorFormatter`.** A caller test that checks `error.cause` proves nothing about what the browser receives; look for `appRouter.getErrorShape(...)` + a superjson round-trip, and `TRPCClientError.from` on both shapes (HTTP and in-process RSC link).
- **"Only a request from outside the UI reaches this branch" is usually false under a stale page.** Check whether a refresh-free UI still shows the button after a colleague's change (handover, assignment); if so, the message for that branch is user-visible.

- **Mutation-test code reviews without touching the repo.** `rsync` the repo (minus node_modules/.git/.next/brain/.env*) into the scratchpad, `ln -s` the real node_modules, mutate the copy and run `pnpm exec cross-env NODE_ENV=test vitest --run <file>` there. Proves whether a guard/catch branch is actually tested (e.g., a 23505 fallback that no test reaches).
  **Why:** "the harness fails without X" claims are otherwise only read, not verified. **How to apply:** every lock/guard/fallback the charter names.
- **On a fix re-review, check that "declared in tech debt / ledger" fixes are committed.** `git diff <reviewed-commit> -- brain/tech-debt/...` shows notes that exist only in the working tree; a review pinned to a commit can't count them as resolved. Also check the plan's decision text (e.g. P4) was updated when a fix narrows a rule.
- **Under a lock, check what the confirmation token identifies.** A lock serializes writers but a confirmation keyed on the container (customer id) instead of the item (alert id) still lets a stale confirmation close an item set meanwhile.

- **Resolve every "(§N)" or "tracked in tech-debt" pointer in a plan before accepting it.** A plan that says a pre-existing risk is "out of perimeter (§15)" must have that risk in §15 or in the tech-debt file; grep both for the risk's own nouns (here "JSON", "lock", the column name). Missing entries mean the pointer is UNSUPPORTED even when the behavior claim is true.
- **Parity with a sibling procedure: extract both blocks with awk and `diff` them.** If only the names differ, the parity claim is proven structurally; then say which failure modes the sibling shares (lost update, empty-join wipe) and that they are not worse.

Related: [[vacuous-test-patterns]]
