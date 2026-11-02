---
name: review-fold-feasibility-checks
description: When a spec folds UI-review criteria, test feasibility - segment-pair contrast with zero parts, toast never-covers-focus vs the default position, skeleton height vs data-dependent sections, message precedence across error ACs
metadata:
  type: feedback
---

Criteria copied from a UI review can be impossible once read as universal rules. Check each before passing it:

- **"Every pair of adjacent bar segments >= 3:1" + legend dots >= 3:1 on a white card.** Every colour is then L <= 0.30, and at most two colours can be mutually 3:1. A zero-width middle part makes non-neighbours adjacent, so with 4 parts the rule is unsatisfiable on reachable rows. The fix is to measure each segment against the separator/card and track.
- **"A toast never covers the focused control / any X button".** Focus can move under any fixed toast. Mirror the review's example against the recommended new position: top-right fails for rows in the top ~100 px exactly as bottom-right did for the bottom. Grep the sibling specs for who owns the position (here toast-sonner AC8, implemented, not design-system-web).
- **"Skeleton as tall as the loaded section with the detail open".** If the detail's row count is data-dependent, the criterion holds only for one dataset. Ask for the reference data or a fixed detail height.
- **Error ACs that each put "one message in the summary".** Build the precedence table: the uncertain-outcome message vs the validation message (max dropped below Quanti after the reread), the button label when the summary shows a non-validation message, and the reread failing while the popover's anchor row is replaced by an error state or leaves the top-N list (focus return target gone or disabled).
- **Allocation rules stated as "each share differs by < 1 from the exact share".** They are not unique: [3,1] with Q=2 allows (2,0) and (1,1), so K in the button and in "Ricevono K dei N" is undetermined. Compare with the Decision Log's "all ties by name" claim.

- **Minimax rules with per-person caps** ("take from the others so the highest After is as low as possible; nobody gives more than their own X"). When the person at the top hits their cap, the max is fixed and the rest can split freely, so the rule has many answers. Counterexample: A(Ora 100, cap 1), B(50, 50), C(50, 50), take 10.
- **A reread while a popover is open.** If the loading AC ("while loading, a part shows its skeleton") also covers rereads, the popover's anchor row unmounts during the reread, and the "the row is gone, so it closes on its own" rule fires before the "stays open with the reread preview" rule. Also ask what the panel shows between the response and the end of the reread.
- **A non-modal popover with "clicking outside doesn't close it".** The click still reaches the page: another row's trigger (a second panel?), sort controls, toggles. Also check where focus goes when the confirm button turns disabled while the request is in flight, and after a failure that leaves the panel open.
- **Check the client defaults against the spec's refresh list.** `refetchOnWindowFocus` with `staleTime` 0 and toasts on query errors by default. Compare them with a Non-Goal like "shows the data from load, Riprova, after an assignment" and with "no app error toast".

**Why:** home-admin gate rounds 4 and 5 (2026-11-01/02). Each of these read fine as text and failed under a concrete reachable state.
**How to apply:** any spec that folds `UI-REVIEW.md` / `UX-REVIEW.md` decisions into ACs. Related: [[spec-partition-and-prototype-checks]], [[prototype-spec-gate-checks]].
