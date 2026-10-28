---
name: schema-error-at-catch-site
description: Data->Schema.TaggedError at a tryPromise catch: site; probe odd rejection values in base and head, since a validation throw becomes a defect that skips tapError
metadata:
  type: feedback
---

When an error class built in a `tryPromise({ catch })` mapper (like `toDbError`) moves from `Data.TaggedError` to `Schema.TaggedError`, the constructor now validates its fields. A field filled from a runtime value typed loosely (`cause.message`, `cause.code`) can fail validation. The throw inside `catch:` becomes a Die, so `tapError` hooks (the `tx.failed` flag) never run.

**Why:** the per-class tests (AC10) build errors from realistic literals and never cover these values. A base-vs-head battery of `query(() => Promise.reject(x))` found that an Error whose `message` is not a string (a number, undefined, or a getter returning an object) gives DbError on base and a "Schema validation failed" defect on head. Every other odd value matched: undefined, null, strings, numbers, a symbol or object `code`, DrizzleQueryError with no cause, frozen errors, Dates.

**How to apply:** for each error class built at a catch site, run the same rejection battery on base and on head (an it.effect probe file in two scratch worktrees, each writing JSONL), then diff the `failureTag` / defect results. Grade it by realism: real Postgres errors always carry a string message.

Related: [[effect4-cause-edge-probes]]
