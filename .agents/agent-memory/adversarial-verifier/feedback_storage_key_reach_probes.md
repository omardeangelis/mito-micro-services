---
name: storage-key-reach-probes
description: How to check whether a user-supplied file name can reach other storage keys: fake local GCS/Supabase servers, raw-key battery, spy plus a download-before-check control mutant
metadata:
  type: feedback
---

To judge "is `prefix/<name>` a literal object key" check what each adapter sends on the wire, not what its code looks like. Point the real layer at a local `http.createServer` that logs `req.url`: GCS with `GCS_BUCKET` + `STORAGE_EMULATOR_HOST=http://127.0.0.1:<port>` (custom endpoint means no auth), Supabase with `NEXT_PUBLIC_SUPABASE_URL=<local>` + a fake `SUPABASE_KEY`. No real storage is touched.

Seen in practice: GCS encodes the name (`/o/export%2F..%2Fx`), so keys are literal. Supabase storage-js concatenates the key raw (`_getFinalPath`, no encoding), and fetch's URL parser resolves `..`, `%2e%2e`, `\` and drops `#`, with `?` read as a query. `export/../../other-bucket/x` became `GET|POST /storage/v1/object/other-bucket/x`, and upload uses `upsert: true`. So only the allow-list's character class keeps a download inside the prefix, and an upload helper with no guard can overwrite other buckets.

**Why:** a memory-store test treats `export/../x` as a literal map key, so it cannot show the escape. Reading the adapter alone misses the URL normalisation done by fetch.

**How to apply:** for any name -> key path, run (1) a raw-query corpus through the real route with a spy on `download` (keys must be `[]` for every rejected name), (2) a raw-key battery on both adapters against the fake servers, and (3) a control mutant that downloads before the check (`Effect.either` so the 404 holds): the spy must light up. Route tests that expect 404 kill anchor mutants (404 vs 500) but usually let the order mutant, a `\d`->`.` mutant and a `.trim()`-before-test mutant live. Related: [[feedback_href_builder_safety_checks]], [[feedback_mutant_battery_scratch_copy]].
