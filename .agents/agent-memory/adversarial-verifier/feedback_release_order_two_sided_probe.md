---
name: release-order-two-sided-probe
description: To judge a "frontend before backend" (or reverse) release-order rule, probe both skews with createCaller in two private worktrees, and diff the router keys against origin/main for the cumulative release
metadata:
  type: feedback
---

A plan rule such as "frontend first, then backend" is only checked when both skews are run, not argued:

- **Old client against new server:** private worktree at HEAD, a `*.db.test.ts` that calls the new `getAllCustomers` with the OLD frontend's input (old `orderBy`, `filterBy.status`, `sqlTaskFilter`, a saved-link `sqlFilter` like `state = 'chiamare'`) and prints which row keys are gone. Removed procedures show up as `TypeError ... reading '_def'` through `createCaller` (over HTTP they are NOT_FOUND). A saved-link `sqlFilter` on a dropped join column is `INTERNAL_SERVER_ERROR column "state" does not exist`: a third break the plan did not name.
- **New client against old server:** private worktree at the base commit with the NEW frontend's exact input. Zod strips unknown keys (nested too), so it works and the old extra fields are ignored.
- **Cumulative release:** `diff <(git show origin/main:<router>/index.ts | sed -n '/createTRPCRouter({/,/^})/p') <(sed -n ... HEAD)` lists the procedures the old backend lacks. Here three (`task.getContacts`, `task.getContactById`, `user.updateContactTableVisibleColumns`), while the plan named only one.

**Why:** A17 (PR6 contacts plan) named one reason for the order (`tasks` no longer returned); the probe found three, and the fallback sentence covered one of three missing procedures. The order itself was right.

**How to apply:** before accepting a release-order rule, list every way the skewed pair fails and check the written reason and fallback cover them. Check that the step that depends on the new code (a data migration) is gated on the LAST deploy finishing. Check whether CI deploys the backend (`.github/workflows/deploy-*.yaml` deploy Vercel only; Cloud Run is a manual script).

Tool pitfalls hit in this run: `rg -h` is help, not "no filename" (use `-I`); zsh has no `timeout`; `tsc` with `incremental: true` writes a tsbuildinfo, so pass `--tsBuildInfoFile` into the scratchpad to stay read-only; never redirect into `/tmp/x` (it was a directory).

Related: [[feedback_removed_params_focus_handoff_gates]], [[feedback_real_caller_probe_and_kill_reason]]
