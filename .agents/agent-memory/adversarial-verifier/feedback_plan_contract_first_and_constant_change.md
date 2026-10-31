---
name: plan-contract-first-and-constant-change
description: Plan checks - a contract-only task that adds HttpApi endpoints breaks tsc in every HttpApiBuilder.group; a shared-constant change breaks every test pinning a derived value
metadata:
  type: feedback
---

When a plan has a "contract first" task that adds endpoints to an `HttpApi` group, check `HttpApiBuilder.group` typing (effect 4: `ValidateReturn` gives "Endpoint not handled: X"). Every place that builds that group stops compiling until it handles the new endpoints: the server handlers file and every in-memory fake group in tests (apps/web `src/test/api.tsx` unservedGroups, page fakes like `src/test/home.ts`). grep `"<group>", (handlers` plus multi-line `group(\n MitoApi`.

**Why:** a plan that adds 4 endpoints in one task and their handlers across three later tasks cannot keep "each task ends with green gates".

**How to apply:** also, when a plan changes a shared constant (retention months, limits), `git grep` the constant's consumers AND the derived literal values in tests (e.g. a `min` date, a boundary row date) across src/, apps/web, packages/*; compare to the plan's list of "tests that change on purpose". Related: [[feedback_spec_claim_scheduler_and_nav_label]].
