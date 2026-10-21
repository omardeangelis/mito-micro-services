---
name: release-runbook-as-procedure
description: How to check a release-session runbook as steps a person executes - deploy green vs serving, when the trace/stop rule is read, failure branches, CLI time-to-fail
metadata:
  type: feedback
---

When the charter is "check the release session as a procedure", walk it step by step and ask, for each step, what condition the NEXT step relies on and whether this step establishes it:

- **"Deploy green" is not "new code serving".** Read the deploy workflow comments (here `deploy-production.yaml`: an active Instant Rollback keeps the domain on the old deployment) and look for an older runbook in the same plan that had the real check (Current deployment, no Instant Rollback). A dropped check is a finding when a later step asserts "from now on no code path can ...".
- **Where the read-only extraction sits.** If the trace and the stop rule run before the merge/deploy window and not right before the migration, old code can change the input in between: the stop rule no longer bounds what the migration moves, and the trace cannot be reconciled with the log rows. Also check that a post-check reconciles the audit rows the migration writes with the recorded list.
- **Every precondition needs its failure branch**, including "back to step 1" after a merge already happened (pre-merge git checks no longer apply).
- **Two runbooks for one migration** (an older task's list plus the release task): diff them; the older one keeps stale checks (journal last tag, start values) and safety steps the new one silently drops.
- **CLI that prints no reason:** run one CLI per outcome on template-cloned private DBs. Guard failure and lock timeout gave identical output; only time-to-fail differs (instant vs about lock_timeout). A wrong checkout prints success with exit 0.
- **Probe harness:** a background lock holder started from bash died between tool calls and `sleep` is blocked. Use one node script that opens the holder connection, spawns the CLI under `script -q` and waits for its exit.

**Why:** PR6 G5 pass (v12): the order of the steps was right, but the gaps were in what each step proves to the next one.

**How to apply:** any runbook with deploy, then migrate, then verify. Related: [[real-migrate-cli-probe]], [[release-order-two-sided-probe]], [[lesson_stale-text-after-ledger-change]].
