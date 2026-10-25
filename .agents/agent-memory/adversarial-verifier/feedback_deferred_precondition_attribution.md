---
name: deferred-precondition-attribution
description: When a gate says "only after step X of another plan, which includes A, B, C", grep step X for each listed item; check the gate's own required deploy keeps a hand-made fix; probe "a later refactor fixes it" claims
metadata:
  type: feedback
---

A gate that defers to another plan's step ("GB2 waits for B6, done by its owners: flags, backend login vars, fresh copy") makes a claim per listed item. Check each one:

- Grep the other plan's step (table row, execution notes, ordered list) for every item. An item the gate needs but the step never names (here: login variables of the backend) has no owner: the gate can wait forever, and the owners can mark the step done without it. UNSUPPORTED, and blocking.
- Ask whether the gate's own precondition destroys the item. A deploy script with `gcloud run deploy --set-env-vars/--set-secrets` replaces the whole env, so a variable added by hand before the merge is gone after the merge's deploy, which the gate requires before the test. The only durable form is the script at the merged commit: make that the check.
- Give the gate a non-writing check of the item after the deploy (for login behind a rewrite: GET `/api/auth/providers` on the public domain).
- Also look for a check the previous revision had and the new one dropped (here: "the serving Vercel deployment was built after the flags"), and for success evidence that a stale object can satisfy (per-day file names that overwrite: bind by timestamp).
- A note that says "doing Y later fixes this" (a per-process layer via `ManagedRuntime.make`) gets a 10-line tsx probe: there, a layer error rejects every call, a rejected name included, so the 404 did not come back.

**Why:** chat-storage-effect PR B, docs pass after v4 rerun: GB2, REPORT point 5 and the notes said B6 brings the backend's login variables; B6 never names them, deploy-staging.sh passes none (providers [] under its env), and the merge's own deploy would wipe a hand fix.

**How to apply:** any release gate that defers to another plan or runbook. Related: [[flag-flip-target-env-probe]], [[runtime-topology-claims]], [[release-runbook-as-procedure]].
