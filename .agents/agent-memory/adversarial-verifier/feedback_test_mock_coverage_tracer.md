---
name: test-mock-coverage-tracer
description: How to prove a vi.mock of a service layer (e.g. ErrorReporter in setup.ts) reaches every production path under test, not just the files that assert on it
metadata:
  type: feedback
---

To check that a setup-file mock replaces a real layer on every path, turn the REAL layer into a tracer: `Layer.sync(Tag, () => { appendFileSync(<scratch file>, "BUILD " + globalThis.__vitest_worker__?.filepath) ... })` and run every test file that builds the server layer. An empty trace file proves no test built the real layer. Positive control first: the one test that `vi.unmock`s the module must write a line, or the tracer is blind.

Pair it with mock mutants (mock returns `{...original}`, subclass without the override, layer under another key): each must fail the reportedErrors assertions, so the assertions are not vacuous.

**Why:** assertion tests cover only 4 files; the tracer covers the other ~100 that build serverLayer silently.

**How to apply:** a full `pnpm run test --run` at load ~100 hits the 10 s hook timeout and skips whole files (the CLI `--hookTimeout` did not apply to the inline projects), so skipped files prove nothing. Run a grep-selected file list with `--maxWorkers=6` and check "0 skipped". Effect 4 looks services up by the `key` string (`Context.js`), so two copies of a class with the same id still resolve; count the id strings in `apps/api/dist/server.js` to show one copy.
