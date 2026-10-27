---
name: exception-pair-audit
description: How to audit a closed list of assertion-chain exceptions (removed/added pairs) for hidden changes, and the helper-semantics check that the pairing alone misses
metadata:
  type: feedback
---

Auditing an exceptions file of an AST assertion guard (removed `base:` chain + added chain per pair):

- Pair with the TypeScript scanner, not regex on whitespace: tokenise both chain texts, drop trailing commas, apply only the allowed rewrites (await -> yield*, Fiber.join(x) -> x, runServer(P) -> P.pipe(provide, Effect.exit), `.resolves.` -> yield*), and compare per file in line order. String-literal whitespace stays inside tokens, so reflow cannot hide an edit.
- Add an enclosing-test-title check per pair (scan up from each line to the nearest it/test), so a chain moved into another test is caught.
- Pairing proves the text; it does not prove the value. For every helper turned Effect, list the Clock readers in production code (`git grep "Clock\.\|currentTimeMillis"`) and check whether the helper moved from a live/fixed clock to `it.effect`'s TestClock (epoch 0, frozen, shared by all forked fibers of the test). Relative uses (elapsed budget) stay equal; absolute uses need an explicit `TestClock.setTime`. A shared TestClock set by one concurrent run is seen by the others: look for a reset before releasing a blocked fiber.
- Per-test assertionCalls counts base vs head (another pass may already have them) corroborate that every paired chain still executes; `vi.waitFor` retries make some counts nondeterministic.
- Check the docs' own claim ("only await -> yield* changes") against the variant counts; they tend to omit the runServer/Fiber.join variants.

**Why:** 2026-10-27 PR 3 effect-4 review: 105 pairs token-identical, but the useful findings were helper clock changes and doc claims, not chain text.

**How to apply:** any AC5-style closed-exception audit. Related: [[guard-probes-how-to-check]], [[effect4-vitest5-upgrade-probes]].
