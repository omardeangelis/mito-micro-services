---
name: once-flag-test-dedupe
description: A "shows once" test with two components on the same query key is vacuous (react-query dedupes to one fetch); test dedup flags with distinct keys, re-arm, and per-client isolation
metadata:
  type: feedback
---

A test "toast shows once" rendered two `<Series />` with the same hook args: both share one query key, so one fetch and one `onError`; mutants removing the `sessionToastShown` read, the `onSuccess` re-arm, and moving the flag to module level all survived (152 green).

**Why:** the claim (once across several failing queries) needs distinct keys; the re-arm and the per-client closure need their own cases.

**How to apply:** for any QueryCache flag, probe with `vi.mock` of the toast module and `qc.fetchQuery` on distinct keys: two failures -> 1 toast, other client -> independent, success then failure -> toasts again, default/withData/false modes unaffected. Scratch copy for mutants: rsync apps/web into `<scratch>/apps/`, symlink `packages` and `node_modules` at `<scratch>/` so the relative `@mito/*` links resolve. `pnpm web:test --run` is wrong (double --run); use `pnpm web:test`. Load avg ~17 gives 5s timeouts: rerun failed files with `--testTimeout=30000`.
