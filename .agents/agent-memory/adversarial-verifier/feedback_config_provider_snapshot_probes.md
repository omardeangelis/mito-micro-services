---
name: config-provider-snapshot-probes
description: How to check an Effect 4 "read process.env fresh" wrapper (default ConfigProvider snapshot): mutants, isolation run of the guard tests, v3-vs-v4 env matrix, bundler import.meta.env check
metadata:
  type: feedback
---

For a wrapper that swaps Effect 4's default ConfigProvider (snapshot of process.env at first read) for a fresh `fromEnv()` per run:

- Mutants on the identity check: `false` (never fresh) must kill the env-change guard tests; `true` (always fresh, ignores caller) must kill the tests that pass `fromEnv({ env })`. Also unwrap each call site separately: a wrapper nested inside another wrapped caller is an equivalent mutant (survives).
- Run the guard tests ALONE with `-t` under the never-fresh mutant. They pass: the snapshot is only stale if an earlier test in the same file already read Config. Guards of this kind are order-dependent; ask for an explicit warm-up read or a direct unit test (read, change env, read).
- Differential: base files from `git show origin/dev:` in a scratch dir whose `node_modules/effect` links the orphan `.pnpm/effect@3.x`; head files import v4. Warm the v4 default first, then loop a cartesian env matrix (unset, "", " ", value, plus sibling keys like VERCEL_ENV / K_REVISION / <KEY>_NAME that turn the key into a trie record node) and compare results. tsx: use `.mts` for top-level await.
- Identity probe: `Context.get(Context.empty(), Ref)` vs runSync, ManagedRuntime, Layer build, runForkWith, forked child: the default is cached on the Reference object, so one instance per effect module copy; lookup is by string key, so copies still interoperate.
- v4 `fromEnv` also spreads `import.meta?.env`: compile a one-liner with `node_modules/next/dist/compiled/webpack/webpack.js` (target node) to see what Next emits (it was `undefined`); esbuild with `packages: "external"` leaves effect to native Node ESM.

- "No env read at import" (renames to static layers): in a `*.db.test.ts`, `vi.resetModules()`, swap `process.env` for a get/has/ownKeys Proxy, dynamic-import each module, diff the key set base vs head (library keys like DEBUG are noise, equal both sides). Prove the probe can fail with a `Effect.runSync(choice)`-at-load mutant: it shows `ownKeys` + every env key. Write output with fs to a file (console is swallowed); zsh needs an array for several test paths.

**Why:** a 2026-10-27 review found both D15 guard tests green in isolation with the fix removed; the suite-order kill was the only protection.

**How to apply:** any config/env-resolution change on Effect 4. Related: [[effect4-vitest5-upgrade-probes]], [[mutant-battery-scratch-copy]], [[disabled-message-and-x64-runner]] (python subprocess needs `arch -arm64`).
