---
name: layer-mock-blind-spots
description: Checking route tests that swap an Effect storage layer for Layer.succeed(memory); how to prove the mock bites, and what it cannot see (build order, defects, Buffer vs Uint8Array)
metadata:
  type: feedback
---

A route test that mocks the storage layer module with `Layer.succeed(Storage, memoryService)` runs the real route and service, but three things are invisible to it. Probe each by hand.

- **The mock really replaces the layer:** put `throw new Error("REAL LAYER EVALUATED")` as line 1 of the real `layer.ts` in a scratch copy; all tests stay green (factory never loads the original). Control: copy the test without its `vi.mock` block; it must die with that error. Without the control the throw probe proves nothing.
- **Build order:** `program.pipe(Effect.provide(Layer))` builds the layer before the program runs, so a guard inside the program (allow-list 404) now runs after the layer exists. Base checked it before touching storage. Differential probe on base and head with a real layer and a broken env: `GCS_BUCKET=b GCS_CREDENTIALS_JSON="not json"` gives a typed `StorageConfigError` (route answers 500 instead of 404); Supabase env unset gives a defect in `Layer.sync` (`FiberFailure: supabaseUrl is required.`, the handler rejects). `Effect.either` does not catch defects.
- **Memory returns `Uint8Array.slice()`, real GCS returns a pooled `Buffer`:** a mutant that sends `result.right.buffer` instead of a copy survives, though `Buffer.from([...7 bytes]).buffer.byteLength` is 8192. Wrap `download` in the test layer to return a pooled Buffer, as the importError test wraps `upload`.

Also seen: a regex allow-list mutant battery leaves the date shape (`\d+` for `\d{2}`) and an unescaped dot alive when the 404 cases are only "other prefix", `..` and a suffix; `encodeURIComponent` on a name the regex already restricts is an equivalent mutant.

**Why:** PR B of the chat/storage step moved `api.supabase.*` calls to `services/export/files.ts`; every listed AC assertion passed on base and head, yet the three gaps above were real.

**How to apply:** for any test that stubs an Effect layer, run the throw probe plus control, then one broken-env differential on base and head, then ask what type the real backend returns.

Tooling: no `psql` on this Mac; load `postgres` from the worktree `node_modules/postgres/src/index.js` by absolute path to list `mito_test_%` databases, and read `pg_stat_file('base/'||oid||'/PG_VERSION')` for a leftover database's creation time before blaming your own run. `vitest --sequence.shuffle --sequence.seed=N` and `TZ=Pacific/Kiritimati` are one-line robustness runs for shared in-memory stores and date-named files. Related: [[feedback_mocked_framework_side_effects]], [[feedback_vacuous_test_patterns]], [[feedback_mutant_battery_scratch_copy]], [[feedback_gate_clone_and_doc_count_scope]].
