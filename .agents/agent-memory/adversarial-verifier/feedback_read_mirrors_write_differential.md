---
name: read-mirrors-write-differential
description: To prove a read-side permission/capability field matches the write path, run a matrix of seeds through the read and the real write and compare; boolean capability flags diverge on states the write guard checks first
metadata:
  type: feedback
---

When a read returns `editability` / `canX` that the UI will trust, one scratch `*.db.test.ts` settles "agrees with the write path": `describe.each(roles)` x `it.each(task owner x customer owner x active/superseded)`, call the read, then call the cheapest real write (here `task.setPriority("auto")` and `task.reassign`) and map the write outcome (OK / CONTACT_FORBIDDEN{assignee} / CONTACT_SUPERSEDED{activeTaskId}) to the read value with `expect`. 36 combos ran in under 5 s on PGlite.

**Why:** the editability union matched in all 36, but the boolean `canReassign` did not: an admin on a superseded contact got `true` while `reassign` rejected with CONTACT_SUPERSEDED, because the write guard (`loadEditableContact`) checks "superseded" before the role check. Reading the pure function alone (`canReassign(actor) = admin`) hides this.

**How to apply:** for every boolean capability flag, include the states the write guard rejects before the permission test (superseded, locked, missing customer). Also run the service-wiring mutants the service tests tend to miss: pass `customer: { operatorId: null }` and `{ ...actor, role: "OPERATORE" }` into the permission function; if the suite stays green, the "customer-owner" (A1) and "admin on active contact" cases are untested at the service layer even though the pure function has unit tests.

**Scratchpad collision:** parallel verifiers share the scratchpad directory. A pointer file (`T.txt` holding the scratch path) was overwritten by another verifier mid-run, so a later `T=$(cat T.txt)` pointed at someone else's copy. Hardcode the scratch path in each command (or put a unique id in the file name) and `cmp` a restored file against the repo before trusting a run.

Related: [[feedback_mutant_battery_scratch_copy]], [[feedback_mutant_harness_hygiene]], [[feedback_authz_read_surface_probes]]
