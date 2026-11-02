---
name: retry-timeout-and-global-toast-checks
description: Spec gate checks for registration-style actions - idempotency promise vs repetition definition, late answer after a spec-chosen timeout, the app's global mutation error toast, reload that removes rows the user did not close
metadata:
  type: feedback
---

When a spec folds an "uncertain outcome" decision into a write action (a call to register, an assignment):

- **Idempotency wording.** Read the promise sentence ("anyone who registers again after an uncertain outcome is not counted twice") against the definition sentence ("a repetition is the same attempt sent again, not the same outcome on the same contact"). A new click by the user is a new attempt, so the promise only holds when nothing was written. Look for the case where the user cannot check, for example the reload of the diary fails into its error state. Compare with the twin spec: home-admin says it plainly ("una nuova conferma è un'assegnazione nuova").
- **Spec-chosen timeout.** When the spec adds "no answer within N s = uncertain" and the client runtime has no timeout, ask what a late success or rejection does after the uncertain toast and the reload: a second toast, closing the row in place, moving focus. Each success criterion would claim the same answer.
- **Global error toast.** `apps/web/src/api/queryClient.ts` MutationCache shows `toast.error(describeApiError)` unless `meta.toastErrors: false`, and `describeApiError` prints DB values (`TransitionRejected`, `CallbackNotAllowed`) and "riprova tra poco" for `ApiUnavailable`. A spec whose own toast "never shows DB values" still fails unless it says there is one message and no generic toast. The twin spec said so; check that both do.
- **Reload vs a fix that keeps rows in place.** A fix "closed rows stay until the next load" still lets a section reload remove *open* rows, and everything below moves up. Check the uncertain-but-written row in particular: the server closed its alert, so the reload removes it instead of showing it closed in place.

- **Client timeout + immediate reload.** A client-side "no answer in N s = uncertain" does not stop the server commit. Walk the timeline: the reload right after the timeout reads before the late commit, so a "repetition until the reload succeeds" window closes too early and the re-press is counted twice. Also check what the page shows after the late commit ("late answer changes nothing" codifies stale data).
- **Failed refetch vs "no row disappears".** Read the error AC ("an error replaces the content") against the keep-in-place rule for reloads: after an uncertain outcome from a network drop the reload fails too, the rows vanish and focus goes to body. Also the QueryCache toast on that query failure vs "only this toast".
- **Late outcome on a re-opened page.** "The outcome reaches you on any page, also a new opening of the home": the new instance loaded before the commit; ask whether it applies the outcome or keeps the row open for a double press.

- **Accepted risk.** When the spec states the rare double count (a late server write after the reread, then a new press or confirm) as a risk the owner accepted (Decision Log, "versione semplice", home-operatore OQ13 and home-admin AC43, 2026-11-02), do not flag it again. Check only that the spec says it, and that the same send arriving twice still counts once.

**Why:** home-operatore spec gate, rounds 3-4 (2026-11-02). The four checks above found defects that a plain read of the spec missed.
**How to apply:** any spec with an action that can succeed, be rejected, or end uncertain, in apps/web. Related: [[prototype-spec-gate-checks]], [[review-fold-feasibility-checks]].
