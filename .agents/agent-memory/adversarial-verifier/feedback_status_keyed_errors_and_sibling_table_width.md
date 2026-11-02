---
name: status-keyed-errors-and-sibling-table-width
description: Spec gate checks - error ACs routed by HTTP status vs the contract's existing domain errors on that status; action column of every table at min width, not only the one the UI review flagged; "touched" vs "changed"
metadata:
  type: feedback
---

- **Error routing by status.** When a spec says "401/403/400 → access message, confirm off" and another AC lists business refusals ("receiver no longer in the team", "fewer customers than requested"), grep `packages/contract/src/errors.ts` for `httpApiStatus: 400`. Here `OperatorNotFound` (disabled target) and `CustomerMissing` are 400, so the business case lands in the access bucket under the project's own "status of the tRPC code" rule. The fix is to route by the access refusals of the authz AC, not by raw status.
- **Sibling tables.** A UI review that flags one table's hidden action column (min-w 70rem) may miss the other table (min-w 62rem). Compute min-w against window − sidebar (`DashboardLayout.tsx` w-57 = 228 px, sheet margin ~10 px) at the lowest width. 62rem = 992 px > 786 px at 1024, so the last column is off-screen.
- **"toccato"/"touched".** Form libraries mean focused-then-blurred. A spec meaning "value changed" (Decision Log says "cambiato") should say so: focus moves into the panel on open, and that flips grey/red messages and outside-click closing.
- **Proportional split on a displayed-rounded quantity.** Ask whether the split uses the exact value or the rounded one shown. Ritmo 24.4/25.6 with Q=100 gives 49/51 vs 48/52.

**Why:** home-admin spec gate round 6 (2026-11-02). Reading the spec text alone missed all four.
**How to apply:** any spec with error-outcome ACs, more than one table, or a split rule. Related: [[review-fold-feasibility-checks]], [[retry-timeout-and-global-toast-checks]].
