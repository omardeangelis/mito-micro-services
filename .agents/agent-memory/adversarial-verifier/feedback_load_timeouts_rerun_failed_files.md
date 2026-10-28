---
name: feedback-load-timeouts-rerun-failed-files
description: Full-suite run with many parallel passes (load avg ~100) gives 96 hook-timeout file failures; settle by rerunning only the failed files with --maxWorkers=4 --hookTimeout
metadata:
  type: feedback
---

When other verifier passes share the machine (uptime load average near 100), a full `pnpm run test --run` fails ~100 `.db`/`.pg` files with "Hook timed out in 10000ms" and no assertion failures. Do not report them as regressions and do not trust a green either way.

**How to apply:** list failed files (`grep '^ FAIL'` + sed), then rerun only those: `pnpm run test --run --maxWorkers=4 --hookTimeout=120000 --testTimeout=120000 <files>`. All green there plus the first run's passing files = full coverage. State the load and the flags in the report. `timeout(1)` does not exist on this macOS; do not prefix with it. A client-bundle esbuild probe needs a plugin with a callback in onResolve (Go regexps have no lookahead), and `packages: "external"` makes it vacuous for workspace packages.
