---
name: deferred-precondition-attribution
description: When a gate says "only after step X of another plan, which includes A, B, C", grep step X for each listed item; check the gate's own required deploy keeps a hand-made fix; probe "a later refactor fixes it" claims; attack each non-writing precheck for vacuous passes and unsatisfiable wording
metadata:
  type: feedback
---

A gate that defers to another plan's step ("GB2 waits for B6, done by its owners: flags, backend login vars, fresh copy") makes a claim per listed item. Check each one:

- Grep the other plan's step (table row, execution notes, ordered list) for every item. An item the gate needs but the step never names (here: login variables of the backend) has no owner: the gate can wait forever, and the owners can mark the step done without it. UNSUPPORTED, and blocking.
- Ask whether the gate's own precondition destroys the item. A deploy script with `gcloud run deploy --set-env-vars/--set-secrets` replaces the whole env, so a variable added by hand before the merge is gone after the merge's deploy, which the gate requires before the test. The only durable form is the script at the merged commit: make that the check.
- Give the gate a non-writing check of the item after the deploy (for login behind a rewrite: GET `/api/auth/providers` on the public domain).
- Also look for a check the previous revision had and the new one dropped (here: "the serving Vercel deployment was built after the flags"), and for success evidence that a stale object can satisfy (per-day file names that overwrite: bind by timestamp).
- A note that says "doing Y later fixes this" (a per-process layer via `ManagedRuntime.make`) gets a 10-line tsx probe: there, a layer error rejects every call, a rejected name included, so the 404 did not come back.
- Once the gate has prechecks, attack each one (v6 pass):
  - who answers it when the rewrite is off? `/api/auth/providers` is also served by the frontend's own NextAuth, so it passes without BACKEND_AUTH; ask for a discriminator (the request in the target's request log, or the flag values themselves);
  - "the merge's run is green": read the workflow's later jobs against documented ongoing failures (Vercel Hobby 12-function limit): a red later job makes the literal check unsatisfiable, while a sibling check already says "merge or later";
  - a label set only when an env var is present (`${COMMIT_SHA:+--update-labels=...}`) is inherited by hand deploys, so it can name a commit the image doesn't hold;
  - the test's input preconditions in the UI path (all-invalid import file never calls the upload route; the button is ADMIN-only).

- Fix-verification pass (v7) on such a gate: a date said to be "UTC day" is true only because the deploy script sets `TZ=UTC` (the code uses local `getDate()`), so read the script's env, not just the code; a catch-all "every other outcome: tell owner of X the config is not in effect" over-attributes when some outcomes (storage 500, no file) belong to another step, so check the attribution, not just that a branch exists; a "log line" evidence needs the writer's key format (`object.name` carries `export/`) and the lifecycle-vs-cron timing.

**Why:** chat-storage-effect PR B, docs pass after v4 rerun: GB2, REPORT point 5 and the notes said B6 brings the backend's login variables; B6 never names them, deploy-staging.sh passes none (providers [] under its env), and the merge's own deploy would wipe a hand fix. The next pass found the new prechecks could pass vacuously or not at all.

**How to apply:** any release gate that defers to another plan or runbook. Related: [[flag-flip-target-env-probe]], [[runtime-topology-claims]], [[release-runbook-as-procedure]].
