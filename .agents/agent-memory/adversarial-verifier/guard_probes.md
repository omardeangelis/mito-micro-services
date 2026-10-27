---
name: guard-probes-how-to-check
description: How to probe an assertion-diff guard (AST chain comparison) for false negatives; which probes to run before trusting a "ok" result
metadata:
  type: feedback
---

When a guard reports "ok" on a test-assertion diff, do not trust it until these probes have been run in a scratch git repo (never in the repo under review):

- Whitespace or comma-paren edits inside string literals (`toBe("a b")` -> `toBe("ab")`). Whitespace-stripping normalizers hide these.
- Adding `it.skip` / `describe.skip` with the assertions left in place.
- Moving an assertion from one test into another test. Multiset comparison over a whole file hides relocation.
- Assertion roots the guard does not recognize (for example `expectTypeOf`, `assert(...)` call form).
- A positive control (changed matcher value, deleted test with assertions) must FAIL, and a reflow-only change must pass.

**Why:** the AC5 guard in the td3 PR passed all of the first three cases silently, because it strips every whitespace character from normalized chains and compares whole files as a multiset.

**How to apply:** build the scratch repo under the scratchpad with a copy of the script, and symlink node_modules next to the copied script so `typescript` resolves. In zsh, write `${sha}:path` with braces, because `$sha:a` triggers the `:a` modifier.
