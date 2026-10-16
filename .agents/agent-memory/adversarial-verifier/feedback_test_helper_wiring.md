---
name: test-helper-wiring
description: A test helper that builds its own provider tree proves nothing about the production wiring in the parent server component; probe the real parent (await the async component, rerender its output) and the zsh loop quirk when mutating
metadata:
  type: feedback
---

When the production parent (a server component that places a client provider and its children) is not imported by any test, the suite can pass while the placement that keeps state alive is broken. The notes-chat suite wrapped `CustomerNotes` inside its own `renderChat` helper, so a mutant that re-keyed the provider in `CustomerChatSection` (status node swapped on the last-note deletion) passed all 80 tests. A probe that does `render(await CustomerChatSection(props))` and then `rerender(await CustomerChatSection(...))` with mocked `@/trpc/server` caught it.

**Why:** The previous-round fix for "status region must survive the swap" lived in the parent's wiring, and the helper hid it. Mutation runs showed the gap only after the parent was exercised directly.

**How to apply:** For any claim whose behaviour depends on how a parent places or keys components, grep the test folder for an import of the parent. If none, write a probe that renders the parent's real output and mutate the parent. Also check helper-level mutants (plural announcement, focus guard, author check) survive or die; the notes-chat suite left the focus guard and the plural "Note eliminate" unasserted.

Tooling note: in this zsh shell `for m in "a b"; do ./x $m; done` does not split `$m`; pass the arguments explicitly. Re-diff the scratch copy against a saved `orig-src` after each restore, and expect only the probe file to differ.

Related: [[feedback_live_region_host_unmount]], [[feedback_mutant_apply_verify]], [[feedback_vacuous_test_patterns]]
