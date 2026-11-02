---
name: plan-embedded-conversion-and-cutover
description: Plan checks for a data conversion folded into a recurring job, a cutover instant taken from a manual job run, and per-task gates after a contract-first task
metadata:
  type: feedback
---

When a plan runs a "re-runnable" data conversion inside a recurring job (nightly pass), check each conversion rule against the job's own ACs. Look for lines like "the pass leaves contacts in other states as they are" and "an alert of an inactive contact does not change". The conversion's orphan-closing and state rules usually break them, and the plan's own test list for the job often contains the case that would fail.

When a "cutover / entry-into-use" instant comes from the first successful run of a manually triggered job (for example, read from `cron_run`), list every writer that runs between deploy and that trigger: new code, the legacy app on the shared DB, and nightly jobs. Then check which of their rows the old counting rule still counts. Assumptions like "these rows are not calls because the old rule stops at the cutover" are false during that window. Also check the job's uniqueness guard: a once-per-day key with rerun-only-on-failure means "re-runnable" is once per day after a success.

A client-side "same requestId on automatic retry" design can conflict with an "uncertain outcome" AC that treats network/5xx errors as uncertain right away. Check whether the AC allows a retry before showing "uncertain", and whether a retry still in flight after "uncertain" can write after the user presses again.

When the plan says "every task ends with its package gates green", check the contract task (adding/removing HttpApi endpoints, changing an input or output schema). Group builders, web fakes and existing callers stay red until later tasks. See [[contract-first-and-constant-change]].

When a server task makes a new "single point" for a write (for example alert closing with resolution/resolved_at), check that sibling tasks needing that write depend on it. Look for tasks scheduled in an earlier wave.

Second-round checks after a "tsc green per task" restructure:
- For each removed or retyped shared function or endpoint, `git grep` its callers in every tree, including the frozen legacy app (`src/`) and server HTTP tests (`packages/server/src/http/_test`). Locations usually list only the new app.
- For each validation, check that the services it names are built in earlier waves. A concurrency test naming a service from the same wave cannot be written.
- Check that a web test meant to prove a server-side filter does not run on in-memory fakes; if it does, it is vacuous.

A row that a migration writes (a milestone or config row) does not survive test reset helpers that TRUNCATE every public table (`resetDb` in `src/test/db.ts` and `pg.ts`). This matters most when the code fails on a missing row. Grep the reset helpers and count the test files that call them.

When server behavior starts ignoring a user confirmation for some rows, grep the UI that collects the confirmation (bulk dialogs). If its query is not filtered the same way, the UI asks for a confirmation that does nothing.
